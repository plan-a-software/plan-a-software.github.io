/* Copyright (C) Plan-A Software Ltd - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Kiran Lakhotia <info@plan-a-software.co.uk>, 2014
 */
'use strict';

goog.provide('plana.ui.ts.TypeaheadSearch');

goog.require('goog.Uri');
goog.require('goog.array');
goog.require('goog.events.Event');
goog.require('goog.events.EventType');
goog.require('goog.net.XhrIo');
goog.require('goog.net.XmlHttpFactory');
goog.require('plana.ui.ac.AutoComplete');
goog.require('plana.ui.ac.RemoteObjectMatcher');
goog.require('plana.ui.ac.RemoteObjectMatcher.EventType');
goog.require('plana.ui.ts.TypeaheadSearchRenderer');

/**
 * This class extends {@link plana.ui.ac.AutoComplete}
 * to provide an additional search button that can be used
 * to trigger a fulltext search by adding the 'fullsearch'
 * parameter to requests
 *
 * @constructor
 * @extends {plana.ui.ac.AutoComplete}
 * @param {goog.Uri} uri The server resources to use for fetching a list of
 *     suggestions. You can add custom parameters to uri to pass to the server
 *     with every request
 * @param {boolean=} opt_multi Whether to allow multiple entries separated with
 *     semi-colons or commas
 * @param {string=} opt_inputId Optional id to use for the autocomplete input
 *     element
 * @param {goog.net.XhrIo=} opt_xhrIo Optional XhrIo object to use. By default
 *     we create a new instance
 * @param {goog.net.XmlHttpFactory=} opt_xmlHttpFactory Optional factory to use
 *     when creating XMLHttpRequest objects
 * @param {boolean=} opt_useSimilar Use similar matches. e.g. "gost" => "ghost".
 *     This option is passed along to the server
 * @param {goog.dom.DomHelper=} opt_domHelper The dom helper
 */
plana.ui.ts.TypeaheadSearch = function(
  uri, opt_multi, opt_inputId,
  opt_xhrIo, opt_xmlHttpFactory, opt_useSimilar, opt_domHelper) {
  plana.ui.ac.AutoComplete.call(this,
    uri, opt_multi, new plana.ui.ts.TypeaheadSearchRenderer(), opt_inputId,
    opt_xhrIo, opt_xmlHttpFactory, opt_useSimilar, opt_domHelper);

  /**
   * The last token that was used for a full text
   * search
   * @type {?string}
   * @private
   */
  this.lastSearchToken_ = null;

  /**
   * Flag whether we only search if the token changed
   * from the previous token used to search
   * @type {boolean}
   * @private
   */
  this.forceUniqueTokenSearch_ = true;

  /**
   * Flag whether we're currently doing a fulltext search
   * @type {boolean}
   * @private
   */
  this.searching_ = false;
};
goog.inherits(plana.ui.ts.TypeaheadSearch, plana.ui.ac.AutoComplete);


/**
 * The name of the parameter that specifies the server should
 * perform a full search, instead of a search for suggestions. This
 * parameter will be set to 1 if active
 * @type {string}
 */
plana.ui.ts.TypeaheadSearch.FULLTEXT_SEARCH_PARA = 'fulltextsearch';

/**
 * @override
 */
plana.ui.ts.TypeaheadSearch.prototype.disposeInternal = function() {
  plana.ui.ts.TypeaheadSearch.superClass_.disposeInternal.call(this);
  this.lastSearchToken_ = null;
  this.searching_ = null;
  this.forceUniqueTokenSearch_ = null;
};

/**
 * @override
 */
plana.ui.ts.TypeaheadSearch.prototype.enterDocument = function() {
  plana.ui.ts.TypeaheadSearch.superClass_.enterDocument.call(this);
  var renderer = this.componentRenderer;
  var handler = this.getHandler();
  handler.listen(renderer.getSearchButton(this, this.dom_),
    goog.events.EventType.CLICK, this.onSearch_, false, this);
};


/**
 * @override
 */
plana.ui.ts.TypeaheadSearch.prototype.exitDocument = function() {
  var renderer = this.getRenderer();
  var handler = this.getHandler();
  handler.unlisten(renderer.getSearchButton(this, this.dom_),
    goog.events.EventType.CLICK, this.onSearch_, false, this);
  if (this.searching_) {
    var remoteMatcher = this.cachingMatcher.getRemoteMatcher();
    handler.unlisten(remoteMatcher, [
      plana.ui.ac.RemoteObjectMatcher.EventType.FAILED_REQUEST,
      plana.ui.ac.RemoteObjectMatcher.EventType.MATCHES,
      plana.ui.ac.RemoteObjectMatcher.EventType.INVALID_RESPONSE
    ], this.onMatches_, false, this);
  }
  plana.ui.ts.TypeaheadSearch.superClass_.exitDocument.call(this);
};

/**
 * Callback for events dispatched by the remote matcher. This function simply
 * fires a new event for the listeners attached to this class
 * @param {plana.ui.ac.RemoteObjectMatcher.Event} e The event object dispatched
 *     by the remote matcher object
 * @private
 */
plana.ui.ts.TypeaheadSearch.prototype.onMatches_ = function(e) {
  var remoteMatcher = this.cachingMatcher.getRemoteMatcher();
  var queryData = remoteMatcher.getQueryData();
  queryData.remove(plana.ui.ts.TypeaheadSearch.FULLTEXT_SEARCH_PARA);

  var handler = this.getHandler();
  handler.unlisten(remoteMatcher, [
    plana.ui.ac.RemoteObjectMatcher.EventType.FAILED_REQUEST,
    plana.ui.ac.RemoteObjectMatcher.EventType.MATCHES,
    plana.ui.ac.RemoteObjectMatcher.EventType.INVALID_RESPONSE
  ], this.onMatches_, false, this);

  this.cachingMatcher.disableLocalCache(false);

  var input = this.inputHandler.getInput();
  var searchString = input.value;
  input.disabled = false;
  input.focus();
  this.searching_ = false;
  this.hidePlaceHolders();

  var matches = [];
  switch (e.type) {
    case plana.ui.ac.RemoteObjectMatcher.EventType.FAILED_REQUEST:
    case plana.ui.ac.RemoteObjectMatcher.EventType.INVALID_RESPONSE:
      break;
    case plana.ui.ac.RemoteObjectMatcher.EventType.MATCHES:
      matches = e.matches;
      break;
  }
  if (matches.length == 0) {
    //no match
    this.dispatchEvent({
      type: plana.ui.ts.TypeaheadSearch.EventType.NO_MATCH,
      token: searchString,
      matches: []
    });
  } else {
    //send matches to listeners
    this.dispatchEvent({
      type: plana.ui.ts.TypeaheadSearch.EventType.MATCHES,
      token: searchString,
      matches: goog.array.map(matches, function(m, indx, a) {
        return m.getData();
      })
    });
  }
};

/**
 * Callback for when the search button is explicitly pressed. Only search
 * if the input value is unknown
 * @param {goog.events.BrowserEvent} e
 * @private
 */
plana.ui.ts.TypeaheadSearch.prototype.onSearch_ = function(e) {
  if (this.searching_) return;

  var input = this.inputHandler.getInput();
  var token = input.value;

  if (this.lastSearchToken_ != token ||
    this.forceUniqueTokenSearch_ == false) {

    this.searching_ = true;
    this.lastSearchToken_ = token;
    /*
     * disable input so we don't cancel this search
     * by a user typing more text
     */
    input.disabled = true;
    this.cachingMatcher.disableLocalCache(true);
    var remoteMatcher = this.cachingMatcher.getRemoteMatcher();
    var queryData = remoteMatcher.getQueryData();
    queryData.set(plana.ui.ts.TypeaheadSearch.FULLTEXT_SEARCH_PARA, 1);
    var handler = this.getHandler();
    handler.listen(remoteMatcher, [
      plana.ui.ac.RemoteObjectMatcher.EventType.FAILED_REQUEST,
      plana.ui.ac.RemoteObjectMatcher.EventType.MATCHES,
      plana.ui.ac.RemoteObjectMatcher.EventType.INVALID_RESPONSE
    ], this.onMatches_, false, this);
    remoteMatcher.requestMatches('', -1, token);
  }
};

/**
 * Callback for when a user pressed a key. Here we are only interested
 * in the enter key, which will trigger a search on the server.
 * @param {goog.events.KeyEvent} e The key event dispatched by the
 *     key handler of the input handler control
 * @override
 */
plana.ui.ts.TypeaheadSearch.prototype.onKey = function(e) {
  switch (e.keyCode) {
    case goog.events.KeyCodes.ENTER:
    case goog.events.KeyCodes.MAC_ENTER:
      if (!this.autoComplete.selectHilited()) {
        this.onSearch_(null);
        return;
      }
  }
  plana.ui.ts.TypeaheadSearch.superClass_.onKey.call(this, e);
};

/**
 * Setter whether we only do a fulltext search if the search string (i.e. input
 * value) changed from the previous search
 * @param {boolean} unique
 */
plana.ui.ts.TypeaheadSearch.prototype.setForceUniqueSearch = function(unique) {
  this.forceUniqueTokenSearch_ = unique;
};

/**
 * List of event types dispatched by this UI
 * component.
 * @enum {!string}
 */
plana.ui.ts.TypeaheadSearch.EventType = {
  /**
   * @desc The event dispatched if the filter text does
   *    not match any menu items.
   */
  NO_MATCH: goog.events.getUniqueId('nomatch'),
  /**
   * @desc The event dispatched if a search resulted in
   *    matches.
   */
  MATCHES: goog.events.getUniqueId('match')
};
