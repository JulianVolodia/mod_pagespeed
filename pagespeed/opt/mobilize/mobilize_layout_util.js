/*
 * Copyright 2015 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Author: jmarantz@google.com (Joshua Marantz)
 */


goog.provide('pagespeed.mobLayoutUtil');

goog.require('goog.array');
goog.require('goog.dom');
goog.require('goog.dom.TagName');
goog.require('goog.dom.classlist');
goog.require('goog.string');
goog.require('pagespeed.MobUtil');
goog.require('pagespeed.mobLayoutConstants');


/**
 * Default maximum width in CSS pixels, used if it cannot be calculated from
 * the system.
 * @private @const {number}
 */
pagespeed.mobLayoutUtil.DEFAULT_MAX_WIDTH_ = 400;


/**
 * Maximum allowed margin in pixels.
 * @private @const {number}
 */
pagespeed.mobLayoutUtil.CLAMP_STYLE_LIMIT_PX_ = 4;


/**
 * Maximum allowed negative margin.  Margins less than this value
 * are interpreted as an attempt by the site to shift things completely
 * off the screen, and we don't want to subvert that.
 *
 * @private @const {number}
 */
pagespeed.mobLayoutUtil.MAX_ALLOWED_NEGATIVE_MARGIN_PX_ = -30;


/**
  * CSS class name for single-column layouts.
  * @private @const {string}
  */
pagespeed.mobLayoutUtil.singleColumnClassName_ = 'psSingleColumn';


/**
 * Marker for elements with negative bottom margin.
 * @const {string}
 */
pagespeed.mobLayoutUtil.NEGATIVE_BOTTOM_MARGIN_ATTR =
    'data-pagespeed-negative-bottom-margin';


/**
 * Calculates the maximum width we want for elements on the page.
 *
 * @return {number}
 */
pagespeed.mobLayoutUtil.computeMaxWidth = function() {
  var width = window.document.documentElement.clientWidth;
  if (!width) {
    return pagespeed.mobLayoutUtil.DEFAULT_MAX_WIDTH_;
  }

  // If there is a body, then subtract off any body padding.
  var body = window.document.body;
  if (body) {
    var bodyStyle = window.getComputedStyle(body);
    goog.array.forEach(
        pagespeed.mobLayoutConstants.HORIZONTAL_PADDING_PROPERTIES,
        function(property) {
          var value = pagespeed.MobUtil.computedDimension(bodyStyle, property);
          if (value) {
            width -= value;
          }
        });
  }
  return width;
};


/**
 * Determines whether the computedStyle looks like it might be a sprite.
 *
 * @param {!CSSStyleDeclaration} computedStyle
 * @return {boolean}
 */
pagespeed.mobLayoutUtil.isProbablyASprite = function(computedStyle) {
  var size = computedStyle.getPropertyValue('background-size');
  if (size == 'auto') {
    return false;
  }
  var pos = computedStyle.getPropertyValue('background-position');
  if (pos == 'none') {
    return false;
  }
  // A precisely positioned pixel-position probably indicates a sprite.
  var pieces = pos.split(' ');
  return !!((pieces.length == 2) &&
            (pagespeed.MobUtil.pixelValue(pieces[0]) != null) &&
            (pagespeed.MobUtil.pixelValue(pieces[1]) != null));
};


/**
 * Makes an element be horizontally scrollable.
 *
 * @param {!Element} element
 */
pagespeed.mobLayoutUtil.makeHorizontallyScrollable = function(element) {
  pagespeed.MobUtil.setPropertyImportant(element, 'overflow-x', 'auto');
  pagespeed.MobUtil.setPropertyImportant(element, 'width', 'auto');
  pagespeed.MobUtil.setPropertyImportant(element, 'display', 'block');
};


/**
 * Counts the number of container-like objects.  This is used for a heuristic
 * to differentiate data-tables from layout-tables.
 *
 * @param {!Element} element
 * @return {number}
 */
pagespeed.mobLayoutUtil.countContainers = function(element) {
  var result = 0;
  var tagName = element.tagName.toUpperCase();
  if ((tagName == goog.dom.TagName.DIV) ||
      (tagName == goog.dom.TagName.TABLE) || (tagName == goog.dom.TagName.UL)) {
    ++result;
  }
  for (var child = element.firstElementChild; child;
       child = child.nextElementSibling) {
    result += pagespeed.mobLayoutUtil.countContainers(child);
  }
  return result;
};


/**
 * Determines whether an element looks like it might be a slide-show.
 *
 * @param {!Element} element
 * @return {boolean}
 */
pagespeed.mobLayoutUtil.isPossiblyASlideShow = function(element) {
  return goog.dom.classlist.contains(element, 'nivoSlider');
};


/**
 * Returns the background images for an element as URL strings.  If there
 * are no images, an empty array is returned.  If there was a parsing error,
 * null is returned.
 *
 * Note: this ignores all other attributes of the background image.  See
 * https://developer.mozilla.org/en-US/docs/Web/Guide/CSS/Using_multiple_backgrounds
 * for the full details of what these can be.
 *
 * TODO(jmarantz): move this to mobilize_util.js and replace
 * pagespeed.MobUtil.findBackgroundImage_ there.
 *
 * @param {!Element} element
 * @return {?Array.<string>}
 */
pagespeed.mobLayoutUtil.findBackgroundImages = function(element) {
  var images = [];
  var nodeName = element.tagName.toUpperCase();
  if ((nodeName == goog.dom.TagName.SCRIPT) ||
      (nodeName == goog.dom.TagName.STYLE) ||
      !element.style) {
    return images;
  }
  var computedStyle = window.getComputedStyle(element);
  if (!computedStyle) {
    return images;
  }
  var imagesString = computedStyle.getPropertyValue('background-image');
  if (!imagesString || (imagesString == 'none')) {
    return images;
  }

  // See https://developer.mozilla.org/en-US/docs/Web/CSS/background-image
  //   Simple Example: background-image: "url(a.png), url(b.png)";
  //   Ugly example: background-image: "url(a,b.png), url(c(d).png)"
  //
  // When you pull out the string out of Chrome dev tools the ugly example
  // will look like this:
  // window.getComputedStyle(document.getElementById('foo')).backgroundImage
  // "url(a,b.png), url('c(d).png')"
  //
  // Thus we cannot fully parse the background image by just splitting on ','
  // and stripping the 'url(' and ')'.  We must lex the damn thing to do
  // it right.  But let's punt on that for now and try to use a faster path.
  //
  // First, we eliminate the case where the URL has embedded parens by
  // returning null if we have any quotes.
  if (goog.string.contains(imagesString, '\'') ||
      goog.string.contains(imagesString, '"')) {
    // TODO(jmarantz): Handle quoted URLs.
    return null;
  }

  // Now we can split on comma, but note that url(a,b.png) will be unquoted.
  // We'll know that failed because we will not find the closing paren in
  // the first token.
  var tokens = imagesString.split(',');
  for (var i = 0; i < tokens.length; ++i) {
    var token = goog.string.trim(tokens[i]);

    // Only look at tokens starting with 'url('.  This mechanism of
    // using split(',') is not sufficient for full parsing of background
    // properties.  For example, if you have
    //     "linear-gradient(135deg, white, black)" it will split that
    // into 3 tokens: ['linear-gradient(135deg', 'white', 'black)'],
    // but if we are only looking at the tokens beginning with "url(" then
    // it is sufficient for our needs.  Otherwise we need to write a more
    // complete lexer that tracks paren-depth and quoting state.
    if (goog.string.startsWith(token, 'url(')) {
      if (token.charAt(token.length - 1) != ')') {
        // TODO(jmarantz): Handle commas in the middle of a URL.
        return null;        // Must have been a comma in a URL.  Punt.
      }
      images.push(token.substring(4, token.length - 1));
    }
  }
  return images;
};


/**
 * Removes width constraints from a layout column. This is used for cleaning
 * up desktop multi-column layouts, where the desktop column layout may not
 * match the physical size of a phone.
 *
 * @param {!Element} element
 * @param {!CSSStyleDeclaration} computedStyle
 */
pagespeed.mobLayoutUtil.removeWidthConstraint =
    function(element, computedStyle) {
  // Input fields are sometimes reasonably sized, and shouldn't
  // be auto-width.
  var tagName = element.tagName.toUpperCase();
  if ((tagName != goog.dom.TagName.INPUT) &&
      (tagName != goog.dom.TagName.SELECT)) {
    // Determine whether this element has a width constraint.
    if ((!element.style.backgroundSize) &&
        (computedStyle.width != 'auto')) {
      pagespeed.MobUtil.setPropertyImportant(element, 'width', 'auto');
    }
    if (tagName != goog.dom.TagName.IMG) {
      // Various table elements with explicit widths can be cleaned up
      // to let the browser decide.
      element.removeAttribute('width');
    }
    pagespeed.mobLayoutUtil.removeProperties_(
        element,
        pagespeed.mobLayoutConstants.PROPERTIES_TO_REMOVE_FOR_SINGLE_COLUMN);
    element.className += element.className ? ' ' : '';
    element.classname += pagespeed.mobLayoutUtil.singleColumnClassName_;
  }
};


/**
 * Removes the specified list of proeprties from element.
 *
 * @param {!Element} element
 * @param {!Array.<string>} properties
 * @private
 */
pagespeed.mobLayoutUtil.removeProperties_ = function(element, properties) {
  for (var i = 1; i < arguments.length; ++i) {
    pagespeed.MobUtil.removeProperty(element, arguments[i]);
  }
};


/**
 * Determines whether a table has only data in it (text and images),
 * not more complex HTML structure.  The presence of a non-empty
 * thead or tfoot is also a strong indicator of tabular dat.
 *
 * @param {!Element} table
 * @return {boolean}
 */
pagespeed.mobLayoutUtil.isDataTable = function(table) {
  var numDataNodes = 0;

  // Tables have this hierarchy:
  // <table>
  //   <thead> <tbody> <tfoot>  (index i)
  //     <tr>                   (index j)
  //       <td>                 (index k)
  //         content            (index m) -- we don't use 'l' as an var.

  // Some tables are used for layout. Some are used for showing tabular
  // data.  If therd is a non-empty thead then we'll assume it's tabular.
  // If there is more than one row and more than one column, we'll assume
  // it's tabular as well (might be wrong about this.  We'll return 'false'
  // from this routine if it looks tabular.
  //
  // Note: getElementsByTagName('td').length would not be correct here
  // for counting data nodes, as that would count nodes in nested tables.
  for (var tchild = table.firstElementChild; tchild;
       tchild = tchild.nextElementSibling) {
    for (var tr = tchild.firstElementChild; tr; tr = tr.nextElementSibling) {
      var tagName = tchild.tagName.toUpperCase();
      if ((tagName == goog.dom.TagName.THEAD) ||
          (tagName == goog.dom.TagName.TFOOT)) {
        // The presence of a non-empty thead or tfoot is a strong signal
        // that the structure matters.
        return true;
      }
      for (var td = tr.firstElementChild; td; td = td.nextElementSibling) {
        if (td.tagName.toUpperCase() == goog.dom.TagName.TH) {
          return true;
        }
        ++numDataNodes;
      }
    }
  }

  // On some sites it looks much better to atomize the table, despite the fact
  // that the container count (23) is not too high -- the data-node count (40).
  //
  // In other sites, the numbers are much lower; the critical table has only a
  // couple of containers.  For now, many sites are happy with 3*containers as
  // the threshold, but I suspect we have not seen the last of this
  // heuristic.
  var numContainers = pagespeed.mobLayoutUtil.countContainers(table);
  return ((3 * numContainers) <= numDataNodes);
};


/**
 * Climbs up parent-nodes to find a 'td' and set the width of all the td in the
 * 'tr' to 100/X % where X is the number of td. This works for some sites
 * on Chrome.  Note that we don't get such great results in Firefox
 * responsive-design mode with a narrow screen.  Instead, the aspect ratio and
 * size of the picture is maintained, and the whole table becomes too wide.
 *
 * @param {!Element} element
 */
pagespeed.mobLayoutUtil.reallocateWidthToTableData = function(element) {
  var tdParent = element;
  while (tdParent && (tdParent.tagName.toUpperCase() != goog.dom.TagName.TD)) {
    tdParent = tdParent.parentNode;
  }
  if (tdParent) {
    var tr = tdParent.parentNode;
    if (tr) {
      var td, numTds = 0;
      for (td = tr.firstElementChild; td; td = td.nextElementSibling) {
        if (td.tagName.toUpperCase() == goog.dom.TagName.TD) {
          ++numTds;
        }
      }
      if (numTds > 1) {
        var style = 'width:' + Math.round(100 / numTds) + '%;';
        for (td = tr.firstElementChild; td; td = td.nextElementSibling) {
          if (td.tagName.toUpperCase() == goog.dom.TagName.TD) {
            pagespeed.MobUtil.addStyles(td, style);
          }
        }
      }
    }
  }
};


/**
 * Resizes a table to meet a width constraint.
 *
 * @param {!Element} element
 * @param {number} maxWidth
 */
pagespeed.mobLayoutUtil.resizeWideTable = function(element, maxWidth) {
  if (pagespeed.mobLayoutUtil.isDataTable(element)) {
    pagespeed.mobLayoutUtil.makeHorizontallyScrollable(element);
  } else if (pagespeed.MobUtil.possiblyInQuirksMode()) {
    pagespeed.mobLayoutUtil.reorganizeTableQuirksMode(element, maxWidth);
  } else {
    pagespeed.mobLayoutUtil.reorganizeTableNoQuirksMode(element, maxWidth);
  }
};


/**
 * Re-arranges a table so that it can possibly be resized to the
 * specified dimensions.  For now, just strip out all the content
 * and make them all separate divs.
 *
 * @param {!Element} table
 * @param {number} maxWidth
 */
pagespeed.mobLayoutUtil.reorganizeTableNoQuirksMode =
    function(table, maxWidth) {
  var tchild, row, data, div;

  // Tables have this hierarchy:
  // <table>
  //   <thead> <tbody> <tfoot>  (tchild)
  //     <tr>                   (row)
  //       <td>                 (data)
  //         content
  //
  // For now we treat rows in the head and body the same, but we
  // most certainly should not.  Probably if a table has rows in the
  // head then the structure should be changed to something else that
  // retains the visual organization of header columns to body columns.
  // E.g. one idea is turn a table with N body rows and M columns into
  // a table with 1+X columns (X small, 1-3 depending on widths), M rows,
  // and some kind of navigational element to choose which X of the original
  // rows data should be displayed.
  var fullWidth = '100%';  //'' + this.maxWidth_ + 'px';
  pagespeed.MobUtil.removeProperty(table, 'width');
  pagespeed.MobUtil.setPropertyImportant(table, 'max-width', fullWidth);
  for (tchild = table.firstElementChild; tchild;
       tchild = tchild.nextElementSibling) {
    pagespeed.MobUtil.removeProperty(tchild, 'width');
    pagespeed.MobUtil.setPropertyImportant(tchild, 'max-width', fullWidth);
    for (row = tchild.firstElementChild; row; row = row.nextElementSibling) {
      if (row.tagName.toUpperCase() == goog.dom.TagName.TR) {
        pagespeed.MobUtil.removeProperty(row, 'width');
        pagespeed.MobUtil.setPropertyImportant(row, 'max-width', fullWidth);
        for (data = row.firstElementChild; data;
             data = data.nextElementSibling) {
          if (data.tagName.toUpperCase() == goog.dom.TagName.TD) {
            pagespeed.MobUtil.setPropertyImportant(
                data, 'max-width', fullWidth);
            pagespeed.MobUtil.setPropertyImportant(
                data, 'display', 'inline-block');
          }
        }
      }
    }
  }
};


/**
 * Re-arranges a table so that it can possibly be resized to the
 * specified dimensions.  In quirks mode, you can't make a TD
 * behave nicely when narrowing a table, due to this code in
 * blink/webkit:
 * https://code.google.com/p/chromium/codesearch#chromium/src/third_party/WebKit/Source/core/css/resolver/StyleAdjuster.cpp&rcl=1413930987&l=310
 * See also https://bugs.webkit.org/show_bug.cgi?id=38527
 *
 * Thus we have to rip out the table and put in divs.  Note that this
 * will erase the contents of iframes anywhere in the subtrees of the table,
 * which will have to be reloaded.  This can break some iframes, and thus
 * it is preferable to use reorganizeTableNoQuirksMode, which just sets
 * attributes on the table elements without changing the structure.
 *
 * @param {!Element} table
 * @param {number} maxWidth
 */
pagespeed.mobLayoutUtil.reorganizeTableQuirksMode = function(table, maxWidth) {
  var i, j, k, m, element, data, div, new_element;

  // pagespeed.MobUtil.createXPathFromNode(table));

  // Tables have this hierarchy:
  // <table>
  //   <thead> <tbody> <tfoot>  (index i)
  //     <tr>                   (index j)
  //       <td>                 (index k)
  //         content            (index m) -- we don't use 'l' as an var.
  //
  // For now we treat rows in the head and body the same, but we
  // most certainly should not.  Probably if a table has rows in the
  // head then the structure should be changed to something else that
  // retains the visual organization of header columns to body columns.
  // E.g. one idea is turn a table with N body rows and M columns into
  // a table with 1+X columns (X small, 1-3 depending on widths), M rows,
  // and some kind of navigational element to choose which X of the original
  // rows data should be displayed.
  var replacement = document.createElement(goog.dom.TagName.DIV);
  replacement.style.display = 'inline-block';
  var tableChildren = goog.dom.getChildren(table);
  for (i = 0; i < tableChildren.length; ++i) {
    var bodyChildren = goog.dom.getChildren(tableChildren[i]);
    for (j = 0; j < bodyChildren.length; ++j) {
      var rowChildren = goog.dom.getChildren(bodyChildren[j]);
      for (k = 0; k < rowChildren.length; ++k) {
        data = rowChildren[k];
        // If there is more than one elment in the <td>, then
        // make a div for the elements, otherwise just
        // move the element.
        if (data.childNodes.length == 1) {
          element = data.childNodes[0];
          data.removeChild(element);
          replacement.appendChild(element);
        } else if (data.childNodes.length > 1) {
          div = document.createElement(goog.dom.TagName.DIV);
          div.style.display = 'inline-block';
          var dataChildren = goog.dom.getChildren(data);
          for (m = 0; m < dataChildren.length; ++m) {
            element = dataChildren[m];
            data.removeChild(element);
            div.appendChild(element);
          }
          replacement.appendChild(div);
        }
      }
    }
  }
  var parent = table.parentNode;
  parent.replaceChild(replacement, table);
};


/**
 * Repairs the aspect-ratio damage done by the broser layout engine
 * due to our max-width:100% CSS directive.
 *
 * @param {!Element} element
 */
pagespeed.mobLayoutUtil.repairDistortedImages = function(element) {
  var computedStyle = window.getComputedStyle(element);
  var requestedWidth = pagespeed.MobUtil.findRequestedDimension(
      element, 'width');
  var requestedHeight = pagespeed.MobUtil.findRequestedDimension(
      element, 'height');
  if (requestedWidth && requestedHeight && computedStyle) {
    var width = pagespeed.MobUtil.computedDimension(computedStyle, 'width');
    var height = pagespeed.MobUtil.computedDimension(computedStyle, 'height');
    if (width && height) {
      var widthShrinkage = width / requestedWidth;
      var heightShrinkage = height / requestedHeight;
      if (!pagespeed.MobUtil.aboutEqual(widthShrinkage, heightShrinkage)) {
        pagespeed.MobUtil.consoleLog('aspect ratio problem for ' +
            element.getAttribute('src'));

        if (pagespeed.MobUtil.isSinglePixel(element)) {
          var shrinkage = Math.min(widthShrinkage, heightShrinkage);
          pagespeed.mobLayoutUtil.removeProperties_(
              element, ['width', 'height']);
          element.style.width = requestedWidth * shrinkage;
          element.style.height = requestedHeight * shrinkage;
        } else if (widthShrinkage > heightShrinkage) {
          pagespeed.MobUtil.removeProperty(element, 'height');
        } else {
          // If we let the width go free but set the height, the aspect ratio
          // might not be maintained.  A few ideas on how to fix are here
          //   http://stackoverflow.com/questions/21176336/css-image-to-have-fixed-height-max-width-and-maintain-aspect-ratio
          // Let's try changing the height attribute to max-height.
          pagespeed.mobLayoutUtil.removeProperties_(
              element, ['width', 'height']);
          element.style.maxHeight = requestedHeight;
        }
      }
      if (widthShrinkage < 0.25) {
        pagespeed.MobUtil.consoleLog(
            'overshrinkage for ' + element.getAttribute('src'));
        pagespeed.mobLayoutUtil.reallocateWidthToTableData(element);
      }
    }
  }
};


/**
  * Finds the top and bottom position of an element, in CSS pixels.
  *
  * @param {!Element} element
  * @param {number} parentTop
  * @return {!Array.<number>} top and bottom positions.
  */
pagespeed.mobLayoutUtil.findTopAndBottom = function(element, parentTop) {
  var top;
  var bottom;
  var boundingBox = pagespeed.MobUtil.boundingRect(element);
  if (boundingBox) {
    top = boundingBox.top;
    bottom = boundingBox.bottom;
  } else {
    top = parentTop;
    if (element.offsetParent == element.parentNode) {
      top += element.offsetTop;
    }
    bottom = top + element.offsetHeight - 1;
  }
  return [top, bottom];
};


/**
 * Resizes an image tag so it's no wider than the specified width,
 * maintaining aspect ratio.
 *
 * @param {!Element} element
 * @param {number} maxWidth
 */
pagespeed.mobLayoutUtil.resizeForegroundImage = function(element, maxWidth) {
  var width = element.offsetWidth;
  var height = element.offsetHeight;
  var shrinkage = width / maxWidth;
  if (shrinkage > 1) {
    var newHeight = height / shrinkage;
    pagespeed.MobUtil.setPropertyImportant(
        element, 'width', '' + maxWidth + 'px');
    pagespeed.MobUtil.setPropertyImportant(
        element, 'height', '' + newHeight + 'px');
  }
};


/**
 * Resizes an element's background image so it's no wider than the
 * specified width, maintaining aspect ratio.  Because you can't
 * directly get the natural size of a background image, that data
 * must be supplied by the caller.
 *
 * @param {!Element} element
 * @param {!pagespeed.MobUtil.Dimensions} imageSize
 * @param {!CSSStyleDeclaration} computedStyle
 * @param {number} maxWidth
 */
pagespeed.mobLayoutUtil.resizeBackgroundImage = function(
    element, imageSize, computedStyle, maxWidth) {
  var width = imageSize.width;
  var height = imageSize.height;

  if (width > maxWidth) {
    var shrinkage = maxWidth / width;
    height = Math.round(height * shrinkage);

    var styles = 'background-size:' + maxWidth + 'px ' +
        height + 'px;background-repeat:no-repeat;';

    // If the element was previously sized exactly to the div, then resize
    // the height of the div to match the new height of the background.
    var elementHeight = pagespeed.MobUtil.computedDimension(
        computedStyle, 'height');
    if (height == elementHeight) {
      styles += 'height:' + height + 'px;';
    }
    pagespeed.MobUtil.addStyles(element, styles);
  }
  // Whether or not we are not width-constraining the background image, we
  // give it a height constraint for the benefit of auto-sizing parent
  // nodes.  Note that we look specifically for 'min-height' in
  // resizeVerticallyAndReturnBottom_, so this is both a signal to the
  // browser and to a later pass.
  pagespeed.MobUtil.setPropertyImportant(
      element, 'min-height', '' + height + 'px');
};


/**
 * Sets up text so that it will wrap on word boundaries.
 *
 * @param {!Element} element
 */
pagespeed.mobLayoutUtil.wrapTextOnWhitespace = function(element) {
  // Fixes the top bar of sites that have white-space:nowrap so that all
  // elements on the original line are visible when the width is constrained.
  // Do this before recursing into children as this property inherits, and
  // we'll need less override markup if we do it at the top level.
  var computedStyle = window.getComputedStyle(element);
  if (computedStyle.getPropertyValue('white-space') == 'nowrap') {
    pagespeed.MobUtil.setPropertyImportant(element, 'white-space', 'normal');
  }
};


/**
 * Strips an element of its dimensions specified as a percentage.
 *
 * @param {!Element} element
 * @param {!CSSStyleDeclaration} computedStyle
 */
pagespeed.mobLayoutUtil.stripPercentDimensions = function(
    element, computedStyle) {
  for (var i = 0; i < pagespeed.mobLayoutConstants.NO_PERCENT.length; ++i) {
    var name = pagespeed.mobLayoutConstants.NO_PERCENT[i];
    var value = computedStyle.getPropertyValue(name);
    if (value && (value != '100%') && (value != 'auto') &&
        goog.string.endsWith(value, '%')) {
      pagespeed.MobUtil.setPropertyImportant(element, name, 'auto');
    }
  }
};


/**
 * Trims excess padding on elements.
 *
 * @param {!Element} element
 * @param {!CSSStyleDeclaration} computedStyle
 */
pagespeed.mobLayoutUtil.trimPaddingAndMargins = function(
    element, computedStyle) {
  // Don't remove the left-padding from lists; that makes the bullets
  // disappear at the bottom of some sites.  See
  //     http://www.w3schools.com/cssref/pr_list-style-position.asp
  //
  // Don't remove padding from body.
  var tagName = element.tagName.toUpperCase();
  var isList =
      (tagName == goog.dom.TagName.UL) || (tagName == goog.dom.TagName.OL);
  var isBody = (tagName == goog.dom.TagName.BODY);
  var clampToZero = false;

  // Reduce excess padding on margins.  We don't want to eliminate
  // all padding as that looks terrible on many sites.
  var style = '';
  for (var i = 0; i < pagespeed.mobLayoutConstants.CLAMPED_STYLES.length; ++i) {
    var name = pagespeed.mobLayoutConstants.CLAMPED_STYLES[i];
    if ((!isList || !goog.string.endsWith(name, '-left')) &&
        (!isBody || !goog.string.startsWith(name, 'margin-'))) {
      var value = pagespeed.MobUtil.computedDimension(computedStyle, name);
      if (value == null) {
        continue;
      }
      if (value > pagespeed.mobLayoutUtil.CLAMP_STYLE_LIMIT_PX_) {
        // Without the 'important', juniper's 'register now' field
        // has uneven input fields.
        style += name + ':' + pagespeed.mobLayoutUtil.CLAMP_STYLE_LIMIT_PX_ +
            'px !important;';
      } else if (value < 0) {
        clampToZero = true;

        if (name == 'margin-bottom') {
          // This *might* be a slide-show implemented with a negative
          // margin-bottom based on the element height.  However, it
          // also might just be a small correction.  Heuristically
          // try to distinguish them.
          // TODO(jmarantz): A better heuristic is to make the determination
          // of whether the original margin-bottom matches the element height
          // before applying a viewport and max-width:100%.
          clampToZero = (value >
              pagespeed.mobLayoutUtil.MAX_ALLOWED_NEGATIVE_MARGIN_PX_);
        }
        if (clampToZero) {
          style += name + ':0px !important;';
        } else {
          // It's likely that our usage of max-width:100% and viewports has
          // caused some heights to change (without any explicit JS
          // overrides.  We then may make further adjustments to the element
          // height in expandColumns or elsewhere.  So at this
          // phase we don't adjust the margin-bottom, but just mark the
          // element with an attribute we can easily find later.
          // See http://goo.gl/gzWY6I [smashingmagazine.com]
          element.setAttribute(
              pagespeed.mobLayoutUtil.NEGATIVE_BOTTOM_MARGIN_ATTR, '1');
          // TODO(jmarantz): do this for margin-right as well.
        }
      }
    }
  }
  pagespeed.MobUtil.addStyles(element, style);
};
