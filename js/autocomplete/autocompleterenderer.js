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

goog.provide('plana.ui.ac.AutoCompleteRenderer');
goog.require('goog.dom.DomHelper');
goog.require('goog.ui.Component');

/**
 * This is the default renderer for the
 * autocomplete component. It simply wraps an input
 * inside a div.
 * @constructor
 */
plana.ui.ac.AutoCompleteRenderer = function() {};

/**
 * This function creates the DOM structure for the autocomplete
 * component and returns it
 * @param {!goog.dom.DomHelper} dom
 * @return {!Element}
 */
plana.ui.ac.AutoCompleteRenderer.prototype.createDom = function(dom) {
  /**
   * @type {!Element}
   */
  var div = /**@type {!Element}*/ (dom.createDom('div'));
  /**
   * @type {!HTMLInputElement}
   */
  var input = /**@type {!HTMLInputElement}*/ (dom.createDom('input', {
    'type': 'text',
    'class': 'ac-input'
  }));
  dom.appendChild(div, input);
  return div;
};

/**
 * This function returns the text input if it has been created. Null
 * otherwise
 * @param {!goog.ui.Component} component
 * @param {!goog.dom.DomHelper} dom
 * @return {?HTMLInputElement}
 */
plana.ui.ac.AutoCompleteRenderer.prototype.getInput = function(component, dom) {
  /**
   * @type {?Element}
   */
  var div = component.getElement();
  if (div)
    return /**@type {HTMLInputElement}*/ (dom.getFirstElementChild(div));
  return null;
};