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

goog.provide('plana.ui.tags.TagsInput');
goog.provide('plana.ui.tags.TagsInput.EventType');

goog.require('goog.events.Event');
goog.require('goog.events.EventType');
goog.require('goog.events.KeyHandler.EventType');
goog.require('goog.fx.Animation.EventType');
goog.require('goog.fx.dom.FadeIn');
goog.require('goog.fx.dom.FadeOut');
goog.require('goog.ui.Component');
goog.require('goog.ui.ac.AutoComplete.EventType');
goog.require('plana.ui.ac.AutoComplete');
goog.require('plana.ui.ac.RemoteObject');

/**
 * This class provides a component to manage tags. It was inspired by the the
 * jquery plugin from Tim Schlechter.
 * @see https://github.com/timschlechter/bootstrap-tagsinput
 *
 * It requires bootstrap css for proper rendering of tags.
 *
 * @constructor
 * @extends {goog.ui.Component}
 * @param {goog.Uri} uri The server resources to use for fetching a list of
 *     existing tags. You can add custom parameters to uri to pass to the
 *     server with every request
 * @param {boolean=} opt_createNew Whether to allow a user to create new tags
 *     if the autocomplete didn't match anything. Default: false
 * @param {plana.ui.ac.AutoCompleteRenderer=} opt_autocompleteRenderer The
 *     renderer for the autocomplete input
 * @param {string=} opt_inputId Optional id to use for the autocomplete input
 *     element. Default: ''
 * @param {goog.net.XhrIo=} opt_xhrIo Optional XhrIo object to use. By default
 *     we create a new instance
 * @param {goog.net.XmlHttpFactory=} opt_xmlHttpFactory Optional factory to use
 *     when creating XMLHttpRequest objects
 * @param {boolean=} opt_useSimilar Use similar matches. e.g. "gost" => "ghost".
 *     This option is passed along to the server
 * @param {goog.dom.DomHelper=} opt_domHelper The dom helper
 */
plana.ui.tags.TagsInput = function(
  uri, opt_createNew, opt_autocompleteRenderer, opt_inputId,
  opt_xhrIo, opt_xmlHttpFactory, opt_useSimilar, opt_domHelper) {
  goog.ui.Component.call(this, opt_domHelper);

  /**
   * The autocomplete to create new tags
   * @type {plana.ui.ac.AutoComplete}
   * @private
   */
  this.autocomplete_ = new plana.ui.ac.AutoComplete(uri, false,
    opt_autocompleteRenderer, opt_inputId,
    opt_xhrIo, opt_xmlHttpFactory, opt_useSimilar, opt_domHelper);

  /**
   * The div element containing the tags and the autocomplete
   * input
   * @type {Element}
   * @private
   */
  this.tagsContainer_ = null;

  /**
   * Array of displayed tag elements
   * @type {Array.<Element>}
   * @private
   */
  this.tags_ = [];

  /**
   * Flag whether we should be case insensitive when checking
   * if a tag exists already
   * @type {boolean}
   * @private
   */
  this.caseInsensitive_ = true;

  /**
   * The default width to use for the autocomplete input
   * @type {number}
   * @private
   */
  this.inputSize_ = 8;

  /**
   * The fade in effect to use for duplicate tags
   * @type {goog.fx.dom.FadeIn}
   * @private
   */
  this.duplicateFadeInFx_ = null;

  /**
   * The fade out effect to use for duplicate tags
   * @type {goog.fx.dom.FadeOut}
   * @private
   */
  this.duplicateFadeOutFx_ = null;

  /**
   * Flag whether the user is allowed to create tags if
   * the autocomplete didn't find a match
   * @type {boolean}
   * @private
   */
  this.allowCreateTags_ = opt_createNew || false;
};
goog.inherits(plana.ui.tags.TagsInput, goog.ui.Component);

/**
 * The default css class to use for rendering tags
 * @type {string}
 */
plana.ui.tags.TagsInput.DEFAULT_TAG_CSS = 'label-info';

/**
 * @desc
 * The placeholder message to display in the input. Set
 * to an empty string to disable placeholder text
 */
plana.ui.tags.TagsInput.MSG_ADD_TAG_PLACEHOLDER = goog.getMsg('Add tag');

/**
 * The default speed to use for the fade-in/out animations
 * @type {number}
 */
plana.ui.tags.TagsInput.FADE_SPEED = 100;

/**
 * @override
 */
plana.ui.tags.TagsInput.prototype.disposeInternal = function() {
  plana.ui.tags.TagsInput.superClass_.disposeInternal.call(this);
  this.autocomplete_.dispose();
  this.autocomplete_ = null;
  this.tagsContainer_ = null;
  this.tags_ = null;
  this.caseInsensitive_ = null;
  this.inputSize_ = null;
  if (this.duplicateFadeInFx_ != null) {
    this.duplicateFadeInFx_.dispose();
    this.duplicateFadeInFx_ = null;
  }
  if (this.duplicateFadeOutFx_ != null) {
    this.duplicateFadeOutFx_.dispose();
    this.duplicateFadeOutFx_ = null;
  }
  this.allowCreateTags_ = null;
};

/**
 * This component does not support decoration for now, because the underlying
 * autocomplete doesn't support it
 * @param {Element} element Element to decorate
 * @return {boolean} Return false
 * @override
 */
plana.ui.tags.TagsInput.prototype.canDecorate = function(element) {
  return false;
};

/**
 * @override
 */
plana.ui.tags.TagsInput.prototype.createDom = function() {
  var dom = this.dom_;
  var root = dom.createDom('div');
  this.setElementInternal(root);

  this.tagsContainer_ = dom.createDom('div', {
    'class': 'tagsinput'
  });
  dom.appendChild(root, this.tagsContainer_);

  this.autocomplete_.setPlaceholder(
    plana.ui.tags.TagsInput.MSG_ADD_TAG_PLACEHOLDER);
  this.autocomplete_.render(this.tagsContainer_);
  var input = this.autocomplete_.getInputHandler().getInput();
  dom.setProperties(input, {
    'size': this.inputSize_
  });

  //make sure the autocomplete is shown inline with the tags
  var divAutocomplete = this.autocomplete_.getElement();
  goog.style.setInlineBlock(divAutocomplete);
  goog.dom.classes.add(divAutocomplete, 'tag-input-container');
};

/**
 * @override
 */
plana.ui.tags.TagsInput.prototype.enterDocument = function() {
  plana.ui.tags.TagsInput.superClass_.enterDocument.call(this);
  this.renderTags_();
  var handler = this.getHandler();
  handler.listen(this.autocomplete_, goog.ui.ac.AutoComplete.EventType.UPDATE,
    this.onCheckAddTag_, false);
  handler.listen(this.autocomplete_.getInputHandler(),
    goog.events.KeyHandler.EventType.KEY,
    this.onKey_, false, this);
};

/**
 * @override
 */
plana.ui.tags.TagsInput.prototype.exitDocument = function() {
  this.removeTags_();
  var handler = this.getHandler();
  handler.unlisten(this.autocomplete_, goog.ui.ac.AutoComplete.EventType.UPDATE,
    this.onCheckAddTag_, false);
  handler.unlisten(this.autocomplete_.getInputHandler(),
    goog.events.KeyHandler.EventType.KEY,
    this.onKey_, false, this);
  plana.ui.tags.TagsInput.superClass_.exitDocument.call(this);
};

/**
 * @param {?Array.<string|Object>} model A tag list or null to
 *     clear all tags
 * @override
 */
plana.ui.tags.TagsInput.prototype.setModel = function(model) {
  var old = this.getModel();
  if (old != null) {
    old.length = 0;
  }
  plana.ui.tags.TagsInput.superClass_.setModel.call(this, model);

  if (this.tagsContainer_ != null) {
    this.renderTags_();
    //clear any input
    this.autocomplete_.setModel(null);
  }
};

/**
 * This function removes all tags from the DOM
 * @private
 */
plana.ui.tags.TagsInput.prototype.removeTags_ = function() {
  var dom = this.dom_;
  var handler = this.getHandler();
  var numTags = this.tags_.length;
  for (var i = numTags - 1; i >= 0; --i) {
    this.removeTag_(this.tags_[i], i);
  }
};

/**
 * This function removes a specific tag from the DOM
 * @param {Element} tag The HTML element for a tag
 * @param {number} index The index of the array that stores
 *     the list of rendered tags
 * @private
 */
plana.ui.tags.TagsInput.prototype.removeTag_ = function(tag, index) {
  var dom = this.dom_;
  var handler = this.getHandler();
  var btn = dom.getFirstElementChild(tag);
  handler.unlisten(btn, goog.events.EventType.CLICK,
    this.onRemoveTag_, false, this);
  dom.removeNode(tag);
  this.tags_[index] = null;
  this.tags_.splice(index, 1);
};

/**
 * This function renders the DOM for a tag and adds it to the
 * list of tags
 * @param {string|Object} tag The tag to add
 * @param {number} index The index in the list to add the tag at
 * @private
 */
plana.ui.tags.TagsInput.prototype.renderTag_ = function(tag, index) {
  var dom = this.dom_;
  var tagObj = new plana.ui.ac.RemoteObject(tag);
  var removeBtn = dom.createDom('span', {
    'data-role': 'remove'
  });
  var handler = this.getHandler();
  handler.listen(removeBtn, goog.events.EventType.CLICK,
    this.onRemoveTag_, false, this);

  var css;
  if (goog.isString(tag) || !goog.isDefAndNotNull(tag['tagClass'])) {
    css = plana.ui.tags.TagsInput.DEFAULT_TAG_CSS;
  } else {
    css = tag['tagClass'];
  }

  var tagSpn = dom.createDom('span', {
    'class': 'tag label ' + css
  }, tagObj.toString(), removeBtn);

  this.tags_[index] = tagSpn;
  dom.insertChildAt(this.tagsContainer_, tagSpn, index);
};

/**
 * This function renders a list of tags
 * @private
 */
plana.ui.tags.TagsInput.prototype.renderTags_ = function() {
  var dom = this.dom_;
  var handler = this.getHandler();
  this.removeTags_();

  var tags = /** @type {?Array.<string|Object>} */ this.getModel();
  if (tags == null) return;

  for (var i = 0, tag; tag = tags[i]; ++i) {
    this.renderTag_(tag, i);
  }
};

/**
 * Callback for clicking the remove icon on a tag
 * @param {goog.events.BrowserEvent} e
 * @private
 */
plana.ui.tags.TagsInput.prototype.onRemoveTag_ = function(e) {
  var tags = /** @type {Array.<string|Object>} */ this.getModel();
  goog.asserts.assert(tags != null, 'model cannot be null when removing tags');
  var dom = this.dom_;
  for (var i = 0, el; el = this.tags_[i]; ++i) {
    var btn = dom.getFirstElementChild(el);
    if (btn == e.target) {
      this.removeTag_(el, i);
      var removed = tags.splice(i, 1);
      this.onChange_(plana.ui.tags.TagsInput.EventType.REMOVED, removed[0]);
      break;
    }
  }
};

/**
 * Callback for events from the autocomplete component. This function either
 * adds a new tag, or it dispatches an error message
 * @param {goog.events.Event} e
 * @private
 */
plana.ui.tags.TagsInput.prototype.onCheckAddTag_ = function(e) {
  if (e.data == null) {
    var tokens = this.autocomplete_.getNonMatches();

    if (tokens.length == 0) {
      //empty input, so ignore event
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (!this.allowCreateTags_) {
      e.preventDefault();
      e.stopPropagation();
      //send error
      this.dispatchEvent({
        type: plana.ui.tags.TagsInput.EventType.INVALID,
        tag: tokens[0]
      });
      return;
    } else {
      e.data = tokens[0];
    }
  }

  //add tag to model
  var tags = /** @type {?Array.<string|Object>} */ this.getModel();
  if (tags == null) {
    //this will render the tags
    this.setModel([e.data]);
    this.onChange_(plana.ui.tags.TagsInput.EventType.ADDED, e.data);
  } else {
    var dom = this.dom_;
    var tagObj = new plana.ui.ac.RemoteObject(e.data);
    var tagStr = tagObj.toString();
    tagObj.dispose();

    //check tag doesn't exist already
    var duplicateIndex = -1;
    for (var i = 0, el; el = this.tags_[i]; ++i) {
      var text = dom.getTextContent(el);
      if (this.caseInsensitive_) {
        if (goog.string.caseInsensitiveCompare(tagStr, text) == 0) {
          duplicateIndex = i;
          break;
        }
      } else {
        if (tagStr == text) {
          duplicateIndex = i;
          break;
        }
      }
    }

    if (duplicateIndex == -1) {
      //render tag manually
      var numTags = this.tags_.length;
      this.renderTag_(e.data, numTags);
      tags.push(e.data);
      this.onChange_(plana.ui.tags.TagsInput.EventType.ADDED, e.data);
    } else {
      //fade out then back in
      var tag = this.tags_[duplicateIndex];
      if (this.duplicateFadeOutFx_ != null) {
        this.duplicateFadeOutFx_.dispose();
      }
      if (this.duplicateFadeInFx_ != null) {
        this.duplicateFadeInFx_.dispose();
      }
      this.duplicateFadeOutFx_ = new goog.fx.dom.FadeOut(tag,
        plana.ui.tags.TagsInput.FADE_SPEED);

      this.duplicateFadeInFx_ = new goog.fx.dom.FadeIn(tag,
        plana.ui.tags.TagsInput.FADE_SPEED);

      var handler = this.getHandler();
      handler.listenOnce(this.duplicateFadeOutFx_,
        goog.fx.Animation.EventType.END, function(e) {
          this.duplicateFadeInFx_.play();
          this.duplicateFadeOutFx_.dispose();
          this.duplicateFadeOutFx_ = null;
        }, false, this);
      handler.listenOnce(this.duplicateFadeInFx_,
        goog.fx.Animation.EventType.END, function(e) {
          this.duplicateFadeInFx_.dispose();
          this.duplicateFadeInFx_ = null;
        }, false, this);
      this.duplicateFadeOutFx_.play();
    }
  }
  //clear the input
  this.autocomplete_.setModel(null);
};

/**
 * Callback for key events fired from the autocomplete input. This function
 * checks if the key was a backspace character and thus should delete the
 * last tag
 * element
 * @param {goog.events.KeyEvent} e The key event
 * @private
 */
plana.ui.tags.TagsInput.prototype.onKey_ = function(e) {
  if (e.keyCode === goog.events.KeyCodes.BACKSPACE) {
    var input = this.autocomplete_.getInputHandler().getInput();
    if (goog.string.isEmptySafe(input.value)) {
      //delete
      var numTags = this.tags_.length;
      if (numTags > 0) {
        var tags = /** @type {Array.<string|Object>} */ this.getModel();
        goog.asserts.assert(tags != null,
          'model cannot be null when removing tags via backspace');
        var index = numTags - 1;
        var tag = this.tags_[index];
        this.removeTag_(tag, index);
        var removed = tags.splice(index, 1);
        this.onChange_(plana.ui.tags.TagsInput.EventType.REMOVED, removed[0]);
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }
};

/**
 * This function dispatches change events for listeners
 * @param {string} type The event that caused the change
 * @param {string|Object} tag Tag information
 * @private
 */
plana.ui.tags.TagsInput.prototype.onChange_ = function(type, tag) {
  this.dispatchEvent({
    type: type,
    tag: tag
  });
  this.dispatchEvent(
    new goog.events.Event(
      goog.events.EventType.CHANGE, this
    )
  );
};

/**
 * This function focuses the autocomplete input of this component
 */
plana.ui.tags.TagsInput.prototype.focus = function() {
  this.autocomplete_.focus();
};

/**
 * Setter for the width of the input element for the autocomplete input
 * @param {!number} width The width to set the input element to
 */
plana.ui.tags.TagsInput.prototype.setInputSize = function(width) {
  this.inputSize_ = width;
  var input = this.autocomplete_.getInputHandler().getInput();
  if (input) {
    var dom = this.dom_;
    dom.setProperties(input, {
      'size': this.inputSize_
    });
  }
};

/**
 * Setter for whether we should be case sensitive when checking for existing
 * tags
 * @param {boolean} newValue The value to set
 */
plana.ui.tags.TagsInput.prototype.setCaseInsensitive = function(newValue) {
  this.caseInsensitive_ = newValue;
};

/**
 * Setter for whether we allow the creation of new tags or not
 * @param {boolean} newValue The value to set to
 */
plana.ui.tags.TagsInput.prototype.allowCreateTags = function(newValue) {
  this.allowCreateTags_ = newValue;
};

/**
 * Getter for the autocomplete component
 * @return {plana.ui.ac.AutoComplete}
 */
plana.ui.tags.TagsInput.prototype.getAutoComplete = function() {
  return this.autocomplete_;
};

/**
 * List of events dispatched by this component
 * @enum {string}
 */
plana.ui.tags.TagsInput.EventType = {
  /**
   * @desc The event dispatched if the component does not allow a user to
   * create tags and the token entered does not match any existing tags
   */
  INVALID: goog.events.getUniqueId('invalid'),
  /**
   * @desc The event dispatched after a tag was added
   */
  ADDED: goog.events.getUniqueId('added'),
  /**
   * @desc The event dispatched after a tag was removed
   */
  REMOVED: goog.events.getUniqueId('removed')
};