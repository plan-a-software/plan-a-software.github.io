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

goog.provide('plana.ui.ac.BootstrapRenderer');
goog.require('plana.ui.ac.AutoCompleteRenderer');

/**
 * This renderer adds the bootstrap 'form-control' class
 * to the input element.
 * @constructor
 * @extends {plana.ui.ac.AutoCompleteRenderer}
 */
plana.ui.ac.BootstrapRenderer = function() {
  plana.ui.ac.AutoCompleteRenderer.call(this);
};
goog.inherits(plana.ui.ac.BootstrapRenderer, plana.ui.ac.AutoCompleteRenderer);

/**
 * This function creates the DOM structure for the autocomplete
 * component and returns it
 * @param {!goog.dom.DomHelper} dom
 * @return {Element}
 * @override
 */
plana.ui.ac.BootstrapRenderer.prototype.createDom = function(dom) {
  var div = dom.createDom('div');
  var input = dom.createDom('input', {
    'type': 'text',
    'class': 'form-control'
  });
  dom.appendChild(div, input);
  return div;
};
