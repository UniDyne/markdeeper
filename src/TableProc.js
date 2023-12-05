import { entag } from './StringUtils.js';
import { protect } from './StringProtect.js';



const TABLE_ROW       = /(?:\n[ \t]*(?:(?:\|?[ \t\S]+?(?:\|[ \t\S]+?)+\|?)|\|[ \t\S]+\|)(?=\n))/.source;
const TABLE_SEPARATOR = /\n[ \t]*(?:(?:\|? *\:?-+\:?(?: *\| *\:?-+\:?)+ *\|?|)|\|[\:-]+\|)(?=\n)/.source;
const TABLE_CAPTION   = /\n[ \t]*\[[^\n\|]+\][ \t]*(?=\n)/.source;
const TABLE_REGEXP    = new RegExp(TABLE_ROW + TABLE_SEPARATOR + TABLE_ROW + '+(' + TABLE_CAPTION + ')?', 'g');

function trimTableRowEnds(row) {
    return row.trim().rp(/^\||\|$/g, '');
}


function parseTable(match) {
    // Found a table, actually parse it by rows
    var rowArray = match.split('\n');

    var result = '';

    // Skip the bogus leading row
    var startRow = (rowArray[0] === '') ? 1 : 0;

    var caption = rowArray[rowArray.length - 1].trim();

    if ((caption.length > 3) && (caption[0] === '[') && (caption[caption.length - 1] === ']')) {
        // Remove the caption from the row array
        rowArray.pop();
        caption = caption.substring(1, caption.length - 1);
    } else {
        caption = undefined;
    }

    // Parse the separator row for left/center/right-indicating colons
    var columnStyle = [];
    trimTableRowEnds(rowArray[startRow + 1]).replace(/:?-+:?/g, function (match) {
        var left = (match[0] === ':');
        var right = (match[match.length - 1] === ':');
        columnStyle.push(protect(' style="text-align:' + ((left && right) ? 'center' : (right ? 'right' : 'left')) + '"'));
    });


    var row = rowArray[startRow + 1].trim();
    var hasLeadingBar  = row[0] === '|';
    var hasTrailingBar = row[row.length - 1] === '|';

    var tag = 'th';
        
    for (var r = startRow; r < rowArray.length; ++r) {
        // Remove leading and trailing whitespace and column delimiters
        row = rowArray[r].trim();
        
        if (! hasLeadingBar && (row[0] === '|')) {
            // Empty first column
            row = '&nbsp;' + row;
        }
        
        if (! hasTrailingBar && (row[row.length - 1] === '|')) {
            // Empty last column
            row += '&nbsp;';
        }
        
        row = trimTableRowEnds(row);
        var i = 0;
        result += entag('tr', '<' + tag + columnStyle[0] + '> ' + 
                        row.replace(/ *\| */g, function () {
                            ++i;
                            return ' </' + tag + '><' + tag + columnStyle[i] + '> ';
                        }) + ' </' + tag + '>') + '\n';
        
        // Skip the header-separator row
        if (r == startRow) { 
            ++r; 
            tag = 'td';
        }
    }

    result = entag('table', result, protect('class="table"'));

    if (caption) {
        caption = entag('center', entag('div', caption, protect('class="tablecaption"')));
        if (option('captionAbove', 'table')) {
            result = caption + result;
        } else {
            result = '\n' + result + caption;
        }
    }

    return entag('div', result, "class='table'");
}



export default function processTables(s) { return s.replace(TABLE_REGEXP, parseTable); };
