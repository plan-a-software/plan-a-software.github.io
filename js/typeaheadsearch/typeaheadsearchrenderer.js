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

goog.provide('plana.ui.ts.TypeaheadSearchRenderer');
goog.require('plana.ui.ac.AutoCompleteRenderer');

/**
 * This renderer creates a bootstrap input-group for input
 * and a search button
 * @constructor
 * @extends {plana.ui.ac.AutoCompleteRenderer}
 */
plana.ui.ts.TypeaheadSearchRenderer = function() {
  plana.ui.ac.AutoCompleteRenderer.call(this);
};
goog.inherits(plana.ui.ts.TypeaheadSearchRenderer,
  plana.ui.ac.AutoCompleteRenderer);

/**
 * This function creates the DOM structure for the typeahead
 * component and returns it
 * @param {!goog.dom.DomHelper} dom
 * @return {!Element}
 */
plana.ui.ts.TypeaheadSearchRenderer.prototype.createDom = function(dom) {
  var wrapper = dom.createDom('div');
  var div = dom.createDom('div', {
    'class': 'input-group'
  });
  var input = dom.createDom('input', {
    'type': 'text',
    'class': 'form-control'
  });
  var btnSpan = dom.createDom('span', {
    'class': 'input-group-addon'
  }, null, dom.createDom('i', {
    'class': 'glyphicon glyphicon-search'
  }));
  dom.append(div, input, btnSpan);
  dom.appendChild(wrapper, div);
  return wrapper;
};

/**
 * This function returns the text input
 * @param {!goog.ui.Component} component
 * @param {!goog.dom.DomHelper} dom
 * @return {?Element}
 */
plana.ui.ts.TypeaheadSearchRenderer.prototype.getInput = function(
  component, dom) {
  var wrapper = component.getElement();
  if (wrapper)
    return dom.getFirstElementChild(dom.getFirstElementChild(wrapper));
  return null;
};

/**
 * This function returns the search button
 * @param {!goog.ui.Component} component
 * @param {!goog.dom.DomHelper} dom
 * @return {?Element}
 */
plana.ui.ts.TypeaheadSearchRenderer.prototype.getSearchButton = function(
  component, dom) {
  var wrapper = component.getElement();
  if (wrapper) {
    var div = dom.getFirstElementChild(wrapper);
    var children = dom.getChildren(div);
    return children[1];
  }
  return null;
};
