//const { entag } = require('./StringUtils');
const { protect } = require('./StringProtect');

// Identify list blocks:
// Blank line or line ending in colon, line that starts with #., *, +, -, ☑, or ☐
// and then any number of lines until another blank line
const BLANK_LINES = /\n\s*\n/.source;
// Preceding line ending in a colon
// \u2610 is the ballot box (unchecked box) character
const PREFIX     = /[:,]\s*\n/.source;
const LIST_BLOCK_REGEXP = 
    new RegExp('(' + PREFIX + '|' + BLANK_LINES + '|<p>\s*\n|<br/>\s*\n?)' +
                /((?:[ \t]*(?:\d+\.|-|\+|\*|\u2611|\u2610)(?:[ \t]+.+\n(?:[ \t]*\n)?)+)+)/.source, 'gm');

const ATTRIBS = {'+': protect('class="plus"'), '-': protect('class="minus"'), '*': protect('class="asterisk"'),
    '\u2611': protect('class="checked"'), '\u2610': protect('class="unchecked"')};
const NUMBER_ATTRIBS = protect('class="number"');


function parseListItem(line, current, stack) {
    var trimmed = line.replace(/^\s*/, '');
    var indentLevel = line.length - trimmed.length;

    // Add a CSS class based on the type of list bullet
    var attribs = ATTRIBS[trimmed[0]];
    var isUnordered = !! attribs; // JavaScript for: attribs !== undefined
    attribs = attribs || NUMBER_ATTRIBS;
    var isOrdered   = /^\d+\.[ \t]/.test(trimmed);
    var isBlank     = trimmed === '';
    var start       = isOrdered ? ' ' + protect('start=' + trimmed.match(/^\d+/)[0]) : '';

    var result = "";

    // Add the indentation for the bullet itself
    if (isOrdered || isUnordered) {
        indentLevel += 2;
    }

    if (! current) {
        // Went below top-level indent
        result += '\n' + line;
    } else if (! isOrdered && ! isUnordered && (isBlank || (indentLevel >= current.indentLevel))) {
        // Line without a marker
        result += '\n' + current.indentChars + line;
    } else {
        //console.log(indentLevel + ":" + line);
        if (indentLevel !== current.indentLevel) {
            // Enter or leave indentation level
            if ((current.indentLevel !== -1) && (indentLevel < current.indentLevel)) {
                while (current && (indentLevel < current.indentLevel)) {
                    stack.pop();
                    // End the current list and decrease indentation
                    result += '\n</li></' + current.tag + '>';
                    current = stack[stack.length - 1];
                }
            } else {
                // Start a new list that is more indented
                current = {indentLevel: indentLevel,
                           tag:         isOrdered ? 'ol' : 'ul',
                           // Subtract off the two indent characters we added above
                           indentChars: line.substring(0, indentLevel - 2)};
                stack.push(current);
                result += '\n<' + current.tag + start + '>';
            }
        } else if (current.indentLevel !== -1) {
            // End previous list item, if there was one
            result += '\n</li>';
        } // Indent level changed
        
        if (current) {
            // Add the list item
            result += '\n' + current.indentChars + '<li ' + attribs + '>' + trimmed.replace(/^(\d+\.|-|\+|\*|\u2611|\u2610) /, '');
        } else {
            // Just reached something that is *less* indented than the root--
            // copy forward and then re-process that list
            result += '\n' + line;
            keepGoing = true;
        }
    }

    return result;
}


function parseList(match, prefix, block) {
    var result = prefix;

    // Contains {indentLevel, tag}
    var stack = [];
    var current = {indentLevel: -1};

    block.split('\n').forEach( i => result += parseListItem.call(undefined, i, current, stack) );

    // Remove trailing whitespace
    result = result.replace(/\s+$/,'');

    // Finish the last item and anything else on the stack (if needed)
    for (current = stack.pop(); current; current = stack.pop()) {
        result += '</li></' + current.tag + '>';
    }

    return result + '\n\n';
}


module.exports = function(s) {
    // Identify task list bullets in a few patterns and reformat them to a standard format for
    // easier processing.
    s = s.replace(/^(\s*)(?:-\s*)?(?:\[ \]|\u2610)(\s+)/mg, '$1\u2610$2');
    s = s.replace(/^(\s*)(?:-\s*)?(?:\[[xX]\]|\u2611)(\s+)/mg, '$1\u2611$2');

    var keepGoing = true;

    // Sometimes the list regexp grabs too much because subsequent lines are indented *less*
    // than the first line. So, if that case is found, re-run the regexp.
    while (keepGoing) {
        keepGoing = false;
        s = s.replace(LIST_BLOCK_REGEXP, parseList);
    };

    return s;
};
