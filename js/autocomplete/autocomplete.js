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

goog.provide('plana.ui.ac.AutoComplete');

goog.require('goog.array');
goog.require('goog.events.Event');
goog.require('goog.events.EventType');
goog.require('goog.math.Size');
goog.require('goog.net.XhrIo');
goog.require('goog.net.XmlHttpFactory');
goog.require('goog.string');
goog.require('goog.ui.Component');
goog.require('goog.ui.ac.AutoComplete');
goog.require('goog.ui.ac.AutoComplete.EventType');
goog.require('goog.ui.ac.Renderer');
goog.require('plana.ui.ac.AutoCompleteRenderer');
goog.require('plana.ui.ac.CachingObjectMatcher');
goog.require('plana.ui.ac.InputHandler');
goog.require('plana.ui.ac.RemoteObject');

/**
 * This class is a wrapper around {@link goog.ui.ac.AutoComplete} that uses
 * a remote object matcher. The remote object matcher can retrieve autocomplete
 * suggestions as plain strings, or, custom objects. It is best if the objects
 * have a 'caption' property. This property is used to display the suggestions.
 * If an object does not have a 'caption' property, 'toString' is used instead.
 *
 * @constructor
 * @extends {goog.ui.Component}
 * @param {goog.Uri} uri The server resources to use for fetching a list of
 *     suggestions. You can add custom parameters to uri to pass to the server
 *     with every request
 * @param {boolean=} opt_multi Whether to allow multiple entries separated with
 *     semi-colons or commas
 * @param {plana.ui.ac.AutoCompleteRenderer=} opt_renderer An optional renderer
 *     that extends the default renderer, i.e. implements a 'createDom' and
 *     'getInput' method
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
plana.ui.ac.AutoComplete = function(
  uri, opt_multi, opt_renderer, opt_inputId,
  opt_xhrIo, opt_xmlHttpFactory, opt_useSimilar, opt_domHelper) {
  goog.ui.Component.call(this, opt_domHelper);

  /**
   * Flag whether the input supports separators and thus
   * we need to store an array of selected matches
   * @type {boolean}
   * @private
   */
  this.isArrayModel_ = opt_multi || false;

  /**
   * The id to use for the autocomplete input element
   * @type {string}
   * @private
   */
  this.inputId_ = opt_inputId || '';

  /**
   * Optional placeholder to show in the input textbox
   * @type {string}
   * @private
   */
  this.placeholder_ = '';

  /**
   * Custom renderer for this class. Its main job is to
   * attach custom classes to the container and its input
   * element
   * @type {plana.ui.ac.AutoCompleteRenderer}
   * @protected
   */
  this.componentRenderer = opt_renderer ||
    new plana.ui.ac.AutoCompleteRenderer();

  /**
   * The matcher that combines a local cache of matches with
   * the remote matcher
   * @type {plana.ui.ac.CachingObjectMatcher}
   * @protected
   */
  this.cachingMatcher =
    new plana.ui.ac.CachingObjectMatcher(uri, opt_xhrIo,
      opt_xmlHttpFactory, !! opt_multi, !opt_useSimilar);

  /**
   * The renderer to render the list of suggestions for the
   * autocomplete component
   * @type {goog.ui.ac.Renderer}
   * @private
   */
  this.autoCompleteRenderer_ = null;

  /**
   * The input handler that updates the text input when
   * a match is selected
   * @type {?plana.ui.ac.InputHandler}
   * @protected
   */
  this.inputHandler = null;

  /**
   * The actual autocomplete component
   * @type {?goog.ui.ac.AutoComplete}
   * @protected
   */
  this.autoComplete = null;

  /**
   * @see http://docs.closure-library.googlecode.com/git-history/7bb23f83ca959ae16e10ebc6734b0ba882629904/class_goog_ui_ac_InputHandler.html
   * Whether to prevent the default behavior (moving focus to another element)
   * when tab is pressed. This occurs by default only for multi-value mode.
   * @type {boolean}
   * @private
   */
  this.preventDefaultOnTab_ = !! opt_multi;

  /**
   * The DOM to display while results are fetched from the server
   * @type {?Element}
   * @private
   */
  this.fetchingMatchesDom_ = null;

  /**
   * The image or text to display while we're fetching
   * matches from the server, e.g. a waiting animation
   * @type {?(Element|string)}
   * @private
   */
  this.loadingContent_ = plana.ui.ac.AutoComplete.MSG_LOADING_DEFAULT;

  /**
   * The DOM to display if the server returned no matches
   * @type {?Element}
   * @private
   */
  this.noMatchesDom_ = null;

  /**
   * An optional message to display if the server did not find
   * any matches
   * @type {?(Element|string)}
   * @private
   */
  this.noMatchMsg_ = plana.ui.ac.AutoComplete.MSG_NO_MATCHES_FOUND;
};
goog.inherits(plana.ui.ac.AutoComplete, goog.ui.Component);

/**
 * @desc Default loading message while fetching results
 */
plana.ui.ac.AutoComplete.MSG_LOADING_DEFAULT =
  goog.getMsg('<i>Loading...</i>');

/**
 * @desc Default message if no matches were found on
 * the server
 */
plana.ui.ac.AutoComplete.MSG_NO_MATCHES_FOUND =
  goog.getMsg('<i>Could not find a match</i>');

/**
 * The class name of the row showing loading and no match found
 * messages
 * @type {!string}
 */
plana.ui.ac.AutoComplete.PLACEHOLDER_ROW_CSS = 'ac-fetching-row';

/**
 * @override
 * @suppress {checkTypes}
 */
plana.ui.ac.AutoComplete.prototype.disposeInternal = function() {
  plana.ui.ac.AutoComplete.superClass_.disposeInternal.call(this);
  this.isArrayModel_ = null;
  this.inputId_ = null;
  this.componentRenderer = null;
  this.cachingMatcher.dispose();
  this.cachingMatcher = null;
  if (this.autoCompleteRenderer_ != null) {
    this.autoCompleteRenderer_.dispose();
    this.autoCompleteRenderer_ = null;
  }
  if (this.inputHandler != null) {
    this.inputHandler.dispose();
    this.inputHandler = null;
  }
  if (this.autoComplete != null) {
    this.autoComplete.dispose();
    this.autoComplete = null;
  }
  this.preventDefaultOnTab_ = null;
  this.fetchingMatchesDom_ = null;
  this.loadingContent_ = null;
  this.noMatchesDom_ = null;
  this.noMatchMsg_ = null;
  this.placeholder_ = null;
};

/**
 * This component does not support decoration for now
 * @param {Element} element Element to decorate
 * @return {boolean} Return false
 * @override
 */
plana.ui.ac.AutoComplete.prototype.canDecorate = function(element) {
  return false;
};

/**
 * @override
 */
plana.ui.ac.AutoComplete.prototype.createDom = function() {
  var dom = this.dom_;

  var renderer = this.componentRenderer;
  var container = renderer.createDom(dom);
  this.setElementInternal(container);

  var model = /** @type {?Array.<Object|string>} */
    (plana.ui.ac.AutoComplete.superClass_.getModel.call(this));

  var input = renderer.getInput(this, dom);
  input['placeholder'] = this.placeholder_;
  input['id'] = this.inputId_;

  this.inputHandler = new plana.ui.ac.InputHandler(input, this.isArrayModel_);
  this.inputHandler.setParentEventTarget(this);

  //make sure we initialize the inputHandler if necessary
  this.setModel(model);

  this.autoCompleteRenderer_ = new goog.ui.ac.Renderer(container);
  this.autoCompleteRenderer_.setAutoPosition(true);

  this.autoComplete = new goog.ui.ac.AutoComplete(
    this.cachingMatcher, this.autoCompleteRenderer_, this.inputHandler);

  this.autoComplete.setParentEventTarget(this);

  this.createLoadingDom_();

  this.createNoMatchDom_();
};

/**
 * This function creates the DOM to show a message if there are no
 * matches
 * @private
 */
plana.ui.ac.AutoComplete.prototype.createNoMatchDom_ = function() {
  if (this.noMatchMsg_ == null) {
    if (this.noMatchesDom_ != null) {
      var parent = this.dom_.getParentElement(this.noMatchesDom_);
      if (parent != null)
        this.dom_.removeNode(this.noMatchesDom_);
    }
    this.noMatchesDom_ = null;
  } else {
    var dom = this.dom_;
    if (this.noMatchesDom_ == null) {
      this.noMatchesDom_ = dom.createDom('div', {
        'class': plana.ui.ac.AutoComplete.PLACEHOLDER_ROW_CSS
      });
    }
    if (goog.isString(this.noMatchMsg_))
      this.noMatchesDom_.innerHTML = this.noMatchMsg_;
    else {
      dom.removeChildren(this.noMatchesDom_);
      dom.appendChild(this.noMatchesDom_,
        /** @type {!Node}*/
        (this.noMatchMsg_));
    }
  }
};

/**
 * This function creates the DOM to show the loading image or text
 * @private
 */
plana.ui.ac.AutoComplete.prototype.createLoadingDom_ = function() {
  if (this.loadingContent_ == null) {
    if (this.fetchingMatchesDom_ != null) {
      var parent = this.dom_.getParentElement(this.fetchingMatchesDom_);
      if (parent != null)
        this.dom_.removeNode(this.fetchingMatchesDom_);
    }
    this.fetchingMatchesDom_ = null;
  } else {
    var dom = this.dom_;
    if (this.fetchingMatchesDom_ == null) {
      this.fetchingMatchesDom_ = dom.createDom('div', {
        'class': plana.ui.ac.AutoComplete.PLACEHOLDER_ROW_CSS
      });
    }
    if (goog.isString(this.loadingContent_))
      this.fetchingMatchesDom_.innerHTML = this.loadingContent_;
    else {
      dom.removeChildren(this.fetchingMatchesDom_);
      dom.appendChild(this.fetchingMatchesDom_, this.loadingContent_);
    }
  }
};

/**
 * @override
 */
plana.ui.ac.AutoComplete.prototype.enterDocument = function() {
  plana.ui.ac.AutoComplete.superClass_.enterDocument.call(this);
  var handler = this.getHandler();
  handler.listen(this.autoComplete, [
    goog.ui.ac.AutoComplete.EventType.UPDATE,
    goog.ui.ac.AutoComplete.EventType.SUGGESTIONS_UPDATE,
    goog.ui.ac.AutoComplete.EventType.DISMISS
  ], this.onUpdate_, false);
  handler.listen(this.inputHandler,
    goog.object.getValues(plana.ui.ac.InputHandler.EventType),
    this.onInputEvent_, false);
  handler.listen(this.inputHandler,
    goog.events.KeyHandler.EventType.KEY,
    this.onKey, false);
};

/**
 * @override
 */
plana.ui.ac.AutoComplete.prototype.exitDocument = function() {
  var handler = this.getHandler();
  handler.unlisten(this.autoComplete, [
    goog.ui.ac.AutoComplete.EventType.UPDATE,
    goog.ui.ac.AutoComplete.EventType.SUGGESTIONS_UPDATE,
    goog.ui.ac.AutoComplete.EventType.DISMISS
  ], this.onUpdate_, false);
  handler.unlisten(this.inputHandler,
    goog.object.getValues(plana.ui.ac.InputHandler.EventType),
    this.onInputEvent_, false);
  handler.unlisten(this.inputHandler,
    goog.events.KeyHandler.EventType.KEY,
    this.onKey, false);
  plana.ui.ac.AutoComplete.superClass_.exitDocument.call(this);
};

/**
 * This function adjust the width of the autocomplete container
 * to be the same size as the input
 * @private
 */
plana.ui.ac.AutoComplete.prototype.setSuggestionListWidth_ = function() {
  var autoCompleteRenderer = this.autoCompleteRenderer_;
  if (!autoCompleteRenderer.isVisible()) {
    var renderer = this.componentRenderer;
    var input = renderer.getInput(this, this.dom_);
    var suggestionContainer = autoCompleteRenderer.getElement();
    if (input && suggestionContainer) {
      var inputSize = goog.style.getSize(input);
      goog.style.setWidth(suggestionContainer, inputSize.width);
    }
  }
};

/**
 * This function sets the focus to the text input
 */
plana.ui.ac.AutoComplete.prototype.focus = function() {
  if (this.inputHandler)
    this.inputHandler.getInput().focus();
};

/**
 * Setter for the placeholder text of the input
 * @param {!string} label
 */
plana.ui.ac.AutoComplete.prototype.setPlaceholder = function(label) {
  this.placeholder_ = label;
  if (this.inputHandler)
    this.inputHandler.getInput()['placeholder'] = label;
};

/**
 * Set the HTTP headers. Wrapper around
 * {@link plana.ui.ac.RemoteObjectMatcher#setHeaders}
 * @param {?Object} headers
 */
plana.ui.ac.AutoComplete.prototype.setHeaders = function(headers) {
  this.cachingMatcher.getRemoteMatcher().setRequestHeaders(headers);
};

/**
 * This function sets the content to show while fetching matches
 * from the server
 * @param {Element|string|null} content
 */
plana.ui.ac.AutoComplete.prototype.setLoadingContent = function(content) {
  this.loadingContent_ = content;
  this.createLoadingDom_();
};

/**
 * This function sets the content to show if the token does not
 * match anything
 * @param {Element|string|null} content
 */
plana.ui.ac.AutoComplete.prototype.setNoMatchContent = function(content) {
  this.noMatchMsg_ = content;
  this.createNoMatchDom_();
};

/**
 * This function returns the renderer used to render this component
 * (i.e. wrap the input element inside a div)
 * @return {plana.ui.ac.AutoCompleteRenderer}
 */
plana.ui.ac.AutoComplete.prototype.getRenderer = function() {
  return this.componentRenderer;
};

/**
 * This function returns the actual autocomplete UI
 * @return {goog.ui.ac.AutoComplete}
 */
plana.ui.ac.AutoComplete.prototype.getAutoComplete = function() {
  return this.autoComplete;
};

/**
 * This function returns the input handler used by the
 * autocomplete UI
 * @return {plana.ui.ac.InputHandler}
 */
plana.ui.ac.AutoComplete.prototype.getInputHandler = function() {
  return this.inputHandler;
};

/**
 * This function returns the cached-based remote matcher used by this
 * component
 * @return {plana.ui.ac.CachingObjectMatcher}
 */
plana.ui.ac.AutoComplete.prototype.getCachingMatcher = function() {
  return this.cachingMatcher;
};

/**
 * Callback for events dispatched by the inputhandler
 * @param {goog.events.Event|
 * {
 *  type: string,
 *  target: plana.ui.ac.InputHandler,
 *  token: string,
 *  fullstring: string
 * }} e The event dispatched by the
 *     input handler
 * @private
 */
plana.ui.ac.AutoComplete.prototype.onInputEvent_ = function(e) {
  switch (e.type) {
    case plana.ui.ac.InputHandler.EventType.TEXT_CHANGED:
      this.autoComplete.setToken(e.token, e.fullstring);
      break;
    case plana.ui.ac.InputHandler.EventType.DISMISS:
      this.autoComplete.dismiss();
      break;
    case plana.ui.ac.InputHandler.EventType.SELECT_HIGHLIGHTED:
      if (this.autoComplete.selectHilited())
        e.preventDefault();
      break;
  }
};

/**
 * Callback for KEY events dispatched by the input element associated
 * with this autocomplete. Here we listen for up/down and tab keys
 * to navigate the suggestion list, and for the enter key to select
 * a highlighted item
 * @param {goog.events.KeyEvent} e The key event dispatched by the
 *     key handler of the input handler control. The key event is
 *     forwarded to here because we set the parent event target of
 *     this.inputHandler
 * @protected
 */
plana.ui.ac.AutoComplete.prototype.onKey = function(e) {
  switch (e.keyCode) {
    // If the menu is open and 'down' caused a change then prevent the default
    // action and prevent scrolling.  If the box isn't a multi autocomplete
    // and the menu isn't open, we force it open now.
    case goog.events.KeyCodes.DOWN:
      if (this.autoComplete.isOpen()) {
        this.autoComplete.hiliteNext();
        e.preventDefault();
      } else if (!this.isArrayModel_) {
        this.inputHandler.update(true);
        e.preventDefault();
      }
      break;
      // If the menu is open and 'up' caused a change then prevent the default
      // action and prevent scrolling.
    case goog.events.KeyCodes.UP:
      if (this.autoComplete.isOpen()) {
        this.autoComplete.hilitePrev();
        e.preventDefault();
      }
      break;

      // If tab key is pressed, select the current highlighted item. The default
      // action is also prevented if the input is a multi input, to prevent the
      // user tabbing out of the field.
    case goog.events.KeyCodes.TAB:
      if (this.autoComplete.isOpen() && !e.shiftKey) {
        // Ensure the menu is up to date before completing.
        this.inputHandler.update(true);
        if (this.autoComplete.selectHilited() && this.preventDefaultOnTab_) {
          e.preventDefault();
        }
      } else {
        this.autoComplete.dismiss();
      }
      break;
    case goog.events.KeyCodes.ESC:
      this.autoComplete.dismiss();
      break;
    case goog.events.KeyCodes.ENTER:
    case goog.events.KeyCodes.MAC_ENTER:
      this.autoComplete.selectHilited();
      break;
  }
};

/**
 * Callback for when a user selected an item from the list of
 * suggestions or when a user modified the text input.
 * This function saves the selected item (or null) as the model of
 * this component. It also shows/hides the fetching and no results
 * found messages
 * @param {goog.events.Event} e The event object with additional
 *     row and index properties
 * @private
 */
plana.ui.ac.AutoComplete.prototype.onUpdate_ = function(e) {
  switch (e.type) {
    case goog.ui.ac.AutoComplete.EventType.UPDATE:
      var eventData =
      /**@type {{
            type: string,
            row: ?plana.ui.ac.RemoteObject,
            index: number
          }}*/
      (e);

      /**
       * @type {Object|string|null}
       */
      var rowData = null;
      if (eventData.row != null)
        rowData =
          ( /**@type {!plana.ui.ac.RemoteObject}*/ (eventData.row)).getData();
      /**
       * Forward the event to any listeners that might be
       * interested when an update occurred
       */
      this.dispatchEvent({
        type: e.type,
        data: rowData
      });
      e.stopPropagation();
      break;
    case goog.ui.ac.AutoComplete.EventType.SUGGESTIONS_UPDATE:
      this.setSuggestionListWidth_();
      var state = this.cachingMatcher.getState();
      var renderer = this.autoCompleteRenderer_;
      var dom = this.dom_;
      switch (state) {
        case plana.ui.ac.CachingObjectMatcher.State.FETCHING:
          if (this.fetchingMatchesDom_ != null) {
            var notShowing =
              this.dom_.getParentElement(this.fetchingMatchesDom_) == null;
            if (notShowing) {
              dom.appendChild(renderer.getElement(), this.fetchingMatchesDom_);
              renderer.show();
              renderer.reposition();
            }
          }
          if (this.noMatchesDom_ != null &&
            this.dom_.getParentElement(this.noMatchesDom_) != null) {
            dom.removeNode(this.noMatchesDom_);
          }
          break;
        case plana.ui.ac.CachingObjectMatcher.State.NO_MATCH:
          if (this.fetchingMatchesDom_ != null &&
            this.dom_.getParentElement(this.fetchingMatchesDom_) != null) {
            dom.removeNode(this.fetchingMatchesDom_);
          }
          if (this.noMatchesDom_ != null) {
            var notShowing =
              this.dom_.getParentElement(this.noMatchesDom_) == null;
            if (notShowing) {
              dom.appendChild(renderer.getElement(), this.noMatchesDom_);
              renderer.show();
              renderer.reposition();
            }
          }
          break;
        case plana.ui.ac.CachingObjectMatcher.State.READY:
        case plana.ui.ac.CachingObjectMatcher.State.ERROR:
          this.hidePlaceHolders();
          break;
      }
      break;
    case goog.ui.ac.AutoComplete.EventType.DISMISS:
      this.hidePlaceHolders();
      this.autoCompleteRenderer_.dismiss();
      break;
    default:
      throw 'invalid caching matcher state';
  }
};

/**
 * This function removes any loading or no-match messages
 * @protected
 */
plana.ui.ac.AutoComplete.prototype.hidePlaceHolders = function() {
  var dom = this.dom_;
  if (this.fetchingMatchesDom_ != null &&
    dom.getParentElement(this.fetchingMatchesDom_) != null) {
    dom.removeNode(this.fetchingMatchesDom_);
  }
  if (this.noMatchesDom_ != null &&
    dom.getParentElement(this.noMatchesDom_) != null) {
    dom.removeNode(this.noMatchesDom_);
  }
};

/**
 * @see http://docs.closure-library.googlecode.com/git-history/7bb23f83ca959ae16e10ebc6734b0ba882629904/class_goog_ui_ac_InputHandler.html
 * Sets whether we will prevent the default input behavior (moving focus to the
 * next focusable  element) on TAB.
 * @param {boolean} newValue Whether to preventDefault on TAB.
 */
plana.ui.ac.AutoComplete.prototype.setPreventDefaultOnTab = function(newValue) {
  this.preventDefaultOnTab_ = newValue;
};

/**
 * @param {*} model The list of objects or string
 *     with which to initialize the text input of the autocomplete
 *     input
 * @override
 */
plana.ui.ac.AutoComplete.prototype.setModel = function(model) {
  plana.ui.ac.AutoComplete.superClass_.setModel.call(this,
    /** @type {?Array.<Object|string>} */
    (model));
  var matches;
  if (model == null)
    matches = [];
  else if (goog.isArray(model))
    matches = model;
  else
    matches = [model];
  if (this.inputHandler)
    this.inputHandler.setMatchedObjects(matches);
};

/**
 * @override
 * @return {Object|string|null|Array.<Object|string>}
 */
plana.ui.ac.AutoComplete.prototype.getModel = function() {
  if (this.inputHandler) {
    var matches = this.inputHandler.getMatchedObjects();
    if (this.isArrayModel_)
      return matches;
    else {
      if (matches.length == 0)
        return null;
      return matches[0];
    }
  }
  var model = /** @type {Object|string|null|Array.<Object|string>} */
    (plana.ui.ac.AutoComplete.superClass_.getModel.call(this));
  return model;
};

/**
 * It is possible when a user pastes text in the textbox, and the
 * autocomplete supports separators, that {@link #getModel} does not
 * return the list of items that are displayed in the textbox. For
 * example, if a user pastes
 *     complete,non-matching nonsense
 * the input handler will not return any matches.
 * Use this function to get the list of entries displayed in the
 * textbox that have not been matched with a server result.
 * @return {Array.<string>}
 */
plana.ui.ac.AutoComplete.prototype.getNonMatches = function() {
  if (this.inputHandler == null) return [];
  /**
   * @type {?plana.ui.ac.InputHandler}
   */
  var inputHandler = this.inputHandler;
  var entries = inputHandler.getEntries();
  var matches = inputHandler.getMatchedObjects();
  var filtered = goog.array.filter(entries,
    /**
     * @param  {!string} text
     * @param  {number} indx
     * @return {boolean}
     */

    function(text, indx) {
      if (goog.string.isEmptySafe(text)) return false;
      text = goog.string.trim(text);
      for (var i = 0, match; match = matches[i]; ++i) {
        var remove = false;
        if (goog.isString(match)) {
          if (inputHandler.areStringsEqual(goog.string.trim(match), text))
            remove = true;
        } else {
          /**
           * @type {string|undefined}
           */
          var caption =
            match[plana.ui.ac.RemoteObjectMatcher.CAPTION_PROPERTY];
          if (goog.isDefAndNotNull(caption)) {
            caption = goog.string.trim(caption);
            if (inputHandler.areStringsEqual(caption, text)) {
              remove = true;
            }
          } else {
            remove = inputHandler.areStringsEqual(
              goog.string.trim(match.toString()),
              text);
          }
        }
        if (remove == true) {
          return false;
        }
      }
      return true;
    });
  inputHandler = null;
  return goog.array.map(filtered, function(text, indx) {
    return goog.string.trim(text);
  });
};