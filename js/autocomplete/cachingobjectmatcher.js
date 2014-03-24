// Copyright (C) Plan-A Software Ltd. All Rights Reserved.
//
// Written by Kiran Lakhotia <kiran@plan-a-software.co.uk>, 2014
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

goog.provide('plana.ui.ac.CachingObjectMatcher');

goog.require('goog.Uri');
goog.require('goog.array');
goog.require('goog.async.Throttle');
goog.require('goog.events.EventHandler');
goog.require('goog.events.EventTarget');
goog.require('goog.net.XhrIo');
goog.require('goog.net.XmlHttpFactory');
goog.require('goog.string');
goog.require('goog.ui.ac.RenderOptions');
goog.require('plana.ui.ac.RemoteObject');
goog.require('plana.ui.ac.RemoteObjectMatcher');
goog.require('plana.ui.ac.RemoteObjectMatcher.Event');
goog.require('plana.ui.ac.RemoteObjectMatcher.EventType');

/**
 * This class is based on {@link goog.ui.ac.CachingMatcher}. It differs
 * in the following ways:
 * - it disposes of cached objects (i.e. calls
 *   {@link plana.ui.ac.RemoteObject#dispose})
 * - it defines three states the cache is in:
 *    * fetching server matches
 *    * server returned matches
 *    * no matches found
 *
 * @constructor
 * @extends {goog.events.EventHandler}
 * @param {goog.Uri} uri The uri which generates the auto complete matches. The
 *     search term is passed to the server as the 'token' query param
 * @param {goog.net.XhrIo=} opt_xhrIo Optional XhrIo object to use. By default
 *     we create a new instance
 * @param {goog.net.XmlHttpFactory=} opt_xmlHttpFactory Optional factory to use
 *     when creating XMLHttpRequest objects
 * @param {boolean=} opt_multi Whether to allow multiple entries
 * @param {boolean=} opt_noSimilar If true, request that the server does not do
 *     similarity matches for the input token against the dictionary
 *     The value is sent to the server as the 'use_similar' query param which is
 *     either "1" (opt_noSimilar==false) or "0" (opt_noSimilar==true)
 */
plana.ui.ac.CachingObjectMatcher = function(
  uri, opt_xhrIo, opt_xmlHttpFactory, opt_multi, opt_noSimilar) {
  goog.events.EventHandler.call(this);

  /**
   * The client side cache
   * @type {!Array.<!plana.ui.ac.RemoteObject>}}
   * @private
   */
  this.rows_ = [];

  /**
   * Set of stringified rows, for fast deduping. Each element of this.rows_
   * is stored in rowStrings_ as (' ' + row) to ensure we avoid builtin
   * properties like 'toString'
   * @type {Object.<string, boolean>}
   * @private
   */
  this.rowStrings_ = {};

  /**
   * Maximum number of rows in the cache. If the cache grows larger than this,
   * the entire cache will be emptied
   * @type {number}
   * @private
   */
  this.maxCacheSize_ = 1000;

  /**
   * The remote object matcher
   * @type {plana.ui.ac.RemoteObjectMatcher}
   * @private
   */
  this.remoteMatcher_ =
    new plana.ui.ac.RemoteObjectMatcher(uri, opt_xhrIo,
      opt_xmlHttpFactory, opt_multi, opt_noSimilar);

  /**
   * Number of matches to request from the remote
   * matcher
   * @type {number}
   * @private
   */
  this.remoteMatcherMaxMatches_ = 100;

  /**
   * The timer to control how often remote requests are
   * submitted to the server in response to key events
   * @type {goog.async.Throttle}
   * @private
   */
  this.throttledTriggerBaseMatch_ =
    new goog.async.Throttle(this.triggerBaseMatch_, 150, this);

  /**
   * The request token to use for the remote matcher
   * @type {string}
   * @private
   */
  this.mostRecentToken_ = '';

  /**
   * The complete input string, including the token.
   * This is useful for inputs that allow multiple entries
   * @type {string}
   * @private
   */
  this.mostRecentString_ = '';

  /**
   * The handler to use for handling matches returned by
   * the server
   * @type {?Function}
   * @private
   */
  this.mostRecentMatchHandler_ = null;

  /**
   * The maximum number of matches to return from
   * local cache
   * @type {number}
   * @private
   */
  this.cacheMaxMatches_ = 10;

  /**
   * The set of rows which we last displayed.
   *
   * NOTE(reinerp): The need for this is subtle. When a server result comes
   * back, we don't want to suddenly change the list of results without the user
   * doing anything. So we make sure to add the new server results to the end of
   * the currently displayed list
   *
   * We need to keep track of the last rows we displayed, because the "similar
   * matcher" we use locally might otherwise reorder results
   *
   * @type {Array.<!plana.ui.ac.RemoteObject>}
   * @private
   */
  this.mostRecentMatches_ = [];

  /**
   * The state of the cache manager and its base matcher
   * @type {!number}
   * @private
   */
  this.currentState_ = plana.ui.ac.CachingObjectMatcher.State.READY;

  /**
   * Flag whether we should add matches to the local cache or not
   * @type {boolean}
   * @private
   */
  this.disableLocalCache_ = false;

  //listen to matcher events
  this.listen(this.remoteMatcher_, [
    plana.ui.ac.RemoteObjectMatcher.EventType.FAILED_REQUEST,
    plana.ui.ac.RemoteObjectMatcher.EventType.MATCHES,
    plana.ui.ac.RemoteObjectMatcher.EventType.INVALID_RESPONSE
  ], this.onRemoteMatcherEvent_, false, this);
};
goog.inherits(plana.ui.ac.CachingObjectMatcher, goog.events.EventHandler);

/**
 * @override
 */
plana.ui.ac.CachingObjectMatcher.prototype.disposeInternal = function() {
  this.unlisten(this.remoteMatcher_, [
    plana.ui.ac.RemoteObjectMatcher.EventType.FAILED_REQUEST,
    plana.ui.ac.RemoteObjectMatcher.EventType.MATCHES,
    plana.ui.ac.RemoteObjectMatcher.EventType.INVALID_RESPONSE
  ], this.onRemoteMatcherEvent_, false, this);

  for (var i = 0, match; match = this.rows_[i]; ++i) {
    match.dispose();
  }
  this.rows_.length = 0;
  this.rows_ = null;
  this.rowStrings_ = null;
  this.maxCacheSize_ = null;
  this.remoteMatcher_.dispose();
  this.remoteMatcher_ = null;
  this.remoteMatcherMaxMatches_ = null;
  this.throttledTriggerBaseMatch_.dispose();
  this.throttledTriggerBaseMatch_ = null;
  this.mostRecentToken_ = null;
  this.mostRecentString_ = null;
  this.mostRecentMatchHandler_ = null;
  this.cacheMaxMatches_ = null;
  this.mostRecentMatches_.length = 0;
  this.mostRecentMatches_ = null;
  this.currentState_ = null;
  this.disableLocalCache_ = null;
  plana.ui.ac.CachingObjectMatcher.superClass_.disposeInternal.call(this);
};

/**
 * This function returns true on non-empty strings and if fullstring isn't
 * empty, but token might be. Otherwise returns false
 * @param {string} token Current token in autocomplete
 * @param {string} fullstring The complete value of the autocomplete
 *     input
 * @return {boolean} Whether new matches be requested
 */
plana.ui.ac.CachingObjectMatcher.prototype.shouldRequestMatches = function(
  token, fullstring) {
  return !goog.string.isEmptySafe(token);
};

/**
 * Sets the number of milliseconds with which to throttle the match requests
 * on the underlying matcher
 *
 * Default value: 150
 *
 * @param {number} throttleTime The value to set
 */
plana.ui.ac.CachingObjectMatcher.prototype.setThrottleTime = function(
  throttleTime) {
  //dispose of old throttle
  this.throttledTriggerBaseMatch_.dispose();
  this.throttledTriggerBaseMatch_ =
    new goog.async.Throttle(this.triggerBaseMatch_, throttleTime, this);
};


/**
 * Sets the maxMatches to use for the remote matcher
 *
 * Default value: 100
 *
 * @param {number} maxMatches The value to set
 */
plana.ui.ac.CachingObjectMatcher.prototype.setRemoteMatcherMaxMatches =
  function(maxMatches) {
    this.remoteMatcherMaxMatches_ = maxMatches;
};


/**
 * Sets the maximum size of the local cache. If the local cache grows larger
 * than this size, it will be emptied
 *
 * Default value: 1000
 *
 * @param {number} maxCacheSize The value to set
 */
plana.ui.ac.CachingObjectMatcher.prototype.setMaxCacheSize = function(
  maxCacheSize) {
  this.maxCacheSize_ = maxCacheSize;
};

/**
 * This function is taken from {@link goog.ui.ac.ArrayMatcher}. It
 * matches the token against the specified rows, first looking for prefix
 * matches and if that fails, then looking for similar matches
 *
 * @param {string} token Token to match
 * @param {number} maxMatches Max number of matches to return
 * @return {!Array.<plana.ui.ac.RemoteObject>} Rows that match
 */
plana.ui.ac.CachingObjectMatcher.prototype.getCachedMatches = function(
  token, maxMatches) {
  var matches =
    this.getPrefixMatchesForRows(token, maxMatches);

  if (matches.length == 0) {
    matches = this.getSimilarMatchesForRows(token, maxMatches);
  }
  return matches;
};

/**
 * This function is taken from {@link goog.ui.ac.ArrayMatcher}. It
 * matches the token against the start of words in the row
 * @param {string} token Token to match
 * @param {number} maxMatches Max number of matches to return
 * @return {!Array.<plana.ui.ac.RemoteObject>} Rows that match
 */
plana.ui.ac.CachingObjectMatcher.prototype.getPrefixMatchesForRows = function(
  token, maxMatches) {
  var matches = [];

  if (!goog.string.isEmptySafe(token)) {
    var escapedToken = goog.string.regExpEscape(token);
    var matcher = new RegExp('(^|\\W+)' + escapedToken, 'i');

    var matchCount = 0;
    for (var i = 0, row;
      (row = this.rows_[i]) && matchCount < maxMatches; ++i) {
      if (row.toString().match(matcher)) {
        matchCount++;
        matches.push(row);
      }
    }
  }
  return matches;
};

/**
 * This function is taken from {@link goog.ui.ac.ArrayMatcher}. It
 * matches the token against similar rows, by calculating "distance" between the
 * terms
 * @param {string} token Token to match
 * @param {number} maxMatches Max number of matches to return
 * @return {!Array.<plana.ui.ac.RemoteObject>} The best maxMatches rows
 */
plana.ui.ac.CachingObjectMatcher.prototype.getSimilarMatchesForRows = function(
  token, maxMatches) {
  var results = [];

  for (var index = 0, row; row = this.rows_[index]; ++index) {
    var str = token.toLowerCase();
    var txt = row.toString().toLowerCase();
    var score = 0;

    if (txt.indexOf(str) != -1) {
      score = parseInt((txt.indexOf(str) / 4).toString(), 10);

    } else {
      var arr = str.split('');

      var lastPos = -1;
      var penalty = 10;

      for (var i = 0, c; c = arr[i]; ++i) {
        var pos = txt.indexOf(c);

        if (pos > lastPos) {
          var diff = pos - lastPos - 1;

          if (diff > penalty - 5) {
            diff = penalty - 5;
          }

          score += diff;

          lastPos = pos;
        } else {
          score += penalty;
          penalty += 5;
        }
      }
    }

    if (score < str.length * 6) {
      results.push({
        obj: row,
        score: score,
        index: index
      });
    }
  }

  results.sort(function(a, b) {
    var diff = a.score - b.score;
    if (diff != 0) {
      return diff;
    }
    return a.index - b.index;
  });

  var matches = [];
  for (var i = 0; i < maxMatches && i < results.length; ++i) {
    matches.push(results[i].obj);
  }

  return matches;
};

/**
 * This function is taken from {@link goog.ui.ac.CachingMatcher}.
 * It passes matches to the autocomplete
 * @param {string} token Token to match
 * @param {number} maxMatches Max number of matches to return
 * @param {?Function} matchHandler callback to execute after matching
 * @param {string=} opt_fullstring The complete string in the input
 *     textbox
 */
plana.ui.ac.CachingObjectMatcher.prototype.requestMatchingRows =
  function(token, maxMatches, matchHandler, opt_fullstring) {

    this.cacheMaxMatches_ = maxMatches;
    this.mostRecentToken_ = token;
    this.mostRecentMatchHandler_ = matchHandler;
    this.mostRecentString_ = opt_fullstring || '';

    var fetching = this.shouldRequestMatches(token, this.mostRecentString_);
    if (fetching) {
      this.currentState_ = plana.ui.ac.CachingObjectMatcher.State.FETCHING;
    } else {
      this.currentState_ = plana.ui.ac.CachingObjectMatcher.State.READY;
    }

    this.throttledTriggerBaseMatch_.fire();

    var matches = this.getCachedMatches(token, maxMatches);

    if (matchHandler)
      matchHandler(token, matches);
    this.mostRecentMatches_ = matches;
};


/**
 * This function is taken from {@link goog.ui.ac.CachingMatcher}.
 * Adds the specified rows to the cache
 * @param {!Array.<!plana.ui.ac.RemoteObject>} rows
 * @private
 */
plana.ui.ac.CachingObjectMatcher.prototype.addRowsToCache_ = function(rows) {
  if (!this.disableLocalCache_) {
    goog.array.forEach(rows, function(row) {
      var str = row.toString();
      // The ' ' prefix is to avoid colliding with builtins like toString.
      if (!this.rowStrings_[' ' + str]) {
        this.rows_.push(row);
        this.rowStrings_[' ' + str] = true;
      }
    }, this);
  }
};


/**
 * Checks if the cache is larger than the maximum cache size. If so clears it
 * @private
 */
plana.ui.ac.CachingObjectMatcher.prototype.clearCacheIfTooLarge_ = function() {
  if (this.rows_.length > this.maxCacheSize_) {
    this.clearCache();
  }
};


/**
 * This function is adapted from {@link goog.ui.ac.CachingMatcher}.
 * Triggers a match request against the base matcher. This function is
 * unthrottled, so don't call it directly; instead use
 * this.throttledTriggerBaseMatch_
 * @private
 */
plana.ui.ac.CachingObjectMatcher.prototype.triggerBaseMatch_ = function() {
  this.remoteMatcher_.requestMatches(
    this.mostRecentToken_,
    this.remoteMatcherMaxMatches_,
    this.mostRecentString_);
};

/**
 * Callback for events dispatched by the remote matcher. This function adds
 * results to cached results and calls the match handler to update the list
 * of matches
 * @param {plana.ui.ac.RemoteObjectMatcher.Event} e The event object dispatched
 *     by the remote matcher object
 * @private
 */
plana.ui.ac.CachingObjectMatcher.prototype.onRemoteMatcherEvent_ = function(e) {
  // make sure to keep existing rows highlighted.
  var options = new goog.ui.ac.RenderOptions();
  options.setPreserveHilited(true);

  switch (e.type) {
    case plana.ui.ac.RemoteObjectMatcher.EventType.MATCHES:
      var matches = e.matches;
      this.addRowsToCache_(matches);

      //mostRecentMatches_ contains the matches shown from cache
      var oldMatchesSet = {};
      for (var i = 0, match; match = this.mostRecentMatches_[i]; ++i) {
        // The ' ' prefix is to avoid colliding with builtins like toString.
        oldMatchesSet[' ' + match.toString()] = true;
      }

      var newMatches = goog.array.filter(matches, function(match) {
        return !(oldMatchesSet[' ' + match.toString()]);
      });

      /*combine cached matches and server matches and cut the server
       *matches to the cacheMaxMatches */
      this.mostRecentMatches_ =
        this.mostRecentMatches_.concat(newMatches).
      slice(0, this.cacheMaxMatches_);

      var fetched = this.shouldRequestMatches(
        this.mostRecentToken_,
        this.mostRecentString_);
      if (fetched &&
        this.mostRecentMatches_.length == 0)
        this.currentState_ = plana.ui.ac.CachingObjectMatcher.State.NO_MATCH;
      else
        this.currentState_ = plana.ui.ac.CachingObjectMatcher.State.READY;

      if (this.mostRecentMatchHandler_)
        this.mostRecentMatchHandler_(this.mostRecentToken_,
          this.mostRecentMatches_, options);

      // We clear the cache *after* running the local match, so we don't
      // suddenly remove results just because the remote match came back.
      this.clearCacheIfTooLarge_();
      break;
    case plana.ui.ac.RemoteObjectMatcher.EventType.FAILED_REQUEST:
    case plana.ui.ac.RemoteObjectMatcher.EventType.INVALID_RESPONSE:
      this.currentState_ = plana.ui.ac.CachingObjectMatcher.State.ERROR;
      //show cached items if we have any...
      //maybe notify listeners somehow of error to show an error
      if (this.mostRecentMatchHandler_)
        this.mostRecentMatchHandler_(this.mostRecentToken_,
          this.mostRecentMatches_, options);
      break;
    default:
      throw 'Invalid remote event type:' + e.type;
  }
};

/**
 * This function returns the current state of the cache manager
 * and its base matcher
 * @return {!number}
 */
plana.ui.ac.CachingObjectMatcher.prototype.getState = function() {
  return this.currentState_;
};

/**
 * This function returns the matcher used to fetch matches via
 * ajax
 * @return {!plana.ui.ac.RemoteObjectMatcher}
 */
plana.ui.ac.CachingObjectMatcher.prototype.getRemoteMatcher = function() {
  return this.remoteMatcher_;
};

/**
 * This function clears the cache
 */
plana.ui.ac.CachingObjectMatcher.prototype.clearCache = function() {
  for (var i = 0, match; match = this.rows_[i]; ++i) {
    match.dispose();
  }
  this.rows_.length = 0;
  this.rowStrings_ = {};
};

/**
 * Setter to disable the local cache. If disabled, matches returned by the
 * server will not be stored locally
 * @param {boolean} disable The value to set
 */
plana.ui.ac.CachingObjectMatcher.prototype.disableLocalCache = function(
  disable) {
  this.disableLocalCache_ = disable;
};

/**
 * List of events dispatched by the cache manager
 * @enum {!number}
 */
plana.ui.ac.CachingObjectMatcher.State = {
  /**
   * @desc This state indicates that the remote
   * matcher is fetching results from the server
   */
  FETCHING: 0,
  /**
   * @desc This state indicates that the server
   * could not find matches for a token
   */
  NO_MATCH: 1,
  /**
   * @desc This state indicates that matches
   * have been returned by the server
   */
  READY: 2,
  /**
   * @desc This state indicates that the remote
   * matcher encountered an error trying to
   * get matches
   */
  ERROR: 3
};