const { entag, equalizeLineLengths, isASCIILetter, escapeHTMLEntities } = require('./StringUtils');
const { protect } = require('./StringProtect');


/** Enable for debugging to view character bounds in diagrams */
const DEBUG_SHOW_GRID = false;

/** Overlay the non-empty characters of the original source in diagrams */
const DEBUG_SHOW_SOURCE = DEBUG_SHOW_GRID;

/** Use to suppress passing through text in diagrams */
const DEBUG_HIDE_PASSTHROUGH = DEBUG_SHOW_SOURCE;

/** In pixels of lines in diagrams */
const STROKE_WIDTH = 2;

/** A box of these denotes a diagram */
const DIAGRAM_MARKER = '*';

// http://stackoverflow.com/questions/1877475/repeat-character-n-times
// ECMAScript 6 has a String.repeat method, but that's not available everywhere
const DIAGRAM_START = Array(5 + 1).join(DIAGRAM_MARKER);




/** Extracts one diagram from a Markdown string.

    Returns {beforeString, diagramString, alignmentHint, afterString}
    diagramString will be empty if nothing was found. The
    DIAGRAM_MARKER is stripped from the diagramString. 

    alignmentHint may be:
    floatleft  
    floatright
    center
    flushleft

    diagramString does not include the marker characters. 
    If there is a caption, it will appear in the afterString and not be parsed.
*/
function extractDiagram(sourceString) {
    // Returns the number of wide Unicode symbols (outside the BMP) in string s between indices
    // start and end - 1
    function unicodeSyms(s, start, end) {
        var p = start;
        for (var i = start; i < end; ++i,
        ++p) {
            var c = s.charCodeAt(p);
            p += (c >= 0xD800) && (c <= 0xDBFF);
        }
        return p - end;
    }

    function advance() {
        nextLineBeginning = sourceString.indexOf('\n', lineBeginning) + 1;
        wideCharacters = unicodeSyms(sourceString, lineBeginning + xMin, lineBeginning + xMax);
        textOnLeft = textOnLeft || /\S/.test(sourceString.substring(lineBeginning, lineBeginning + xMin));
        noRightBorder = noRightBorder || (sourceString[lineBeginning + xMax + wideCharacters] !== '*');

        // Text on the right ... if the line is not all '*'
        textOnRight = !noRightBorder && (textOnRight || /[^ *\t\n\r]/.test(sourceString.substring(lineBeginning + xMax + wideCharacters + 1, nextLineBeginning)));
    }

    var noDiagramResult = {
        beforeString: sourceString,
        diagramString: '',
        alignmentHint: '',
        afterString: ''
    };

    // Search sourceString for the first rectangle of enclosed
    // DIAGRAM_MARKER characters at least DIAGRAM_START.length wide
    for (var i = sourceString.indexOf(DIAGRAM_START); i >= 0; i = sourceString.indexOf(DIAGRAM_START, i + DIAGRAM_START.length)) {

        // We found what looks like a diagram start. See if it has either a full border of
        // aligned '*' characters, or top-left-bottom borders and nothing but white space on
        // the left.

        // Look backwards to find the beginning of the line (or of the string)
        // and measure the start character relative to it
        var lineBeginning = Math.max(0, sourceString.lastIndexOf('\n', i)) + 1;
        var xMin = i - lineBeginning;

        // Find the first non-diagram character on this line...or the end of the entire source string
        var j;
        for (j = i + DIAGRAM_START.length; sourceString[j] === DIAGRAM_MARKER; ++j) {}
        var xMax = j - lineBeginning - 1;

        // We have a potential hit. Start accumulating a result. If there was anything
        // between the newline and the diagram, move it to the after string for proper alignment.
        var result = {
            beforeString: sourceString.substring(0, lineBeginning),
            diagramString: '',
            alignmentHint: 'center',
            afterString: sourceString.substring(lineBeginning, i).replace(/[ \t]+$/, ' ')
        };

        var nextLineBeginning = 0
            , wideCharacters = 0;
        var textOnLeft = false
            , textOnRight = false;
        var noRightBorder = false;

        advance();

        // Now, see if the pattern repeats on subsequent lines
        for (var good = true, previousEnding = j; good; ) {
            // Find the next line
            lineBeginning = nextLineBeginning;
            advance();
            if (lineBeginning === 0) {
                // Hit the end of the string before the end of the pattern
                return noDiagramResult;
            }

            if (textOnLeft) {
                // Even if there is text on *both* sides
                result.alignmentHint = 'floatright';
            } else if (textOnRight) {
                result.alignmentHint = 'floatleft';
            }

            // See if there are markers at the correct locations on the next line
            if ((sourceString[lineBeginning + xMin] === DIAGRAM_MARKER) && (!textOnLeft || (sourceString[lineBeginning + xMax + wideCharacters] === DIAGRAM_MARKER))) {

                // See if there's a complete line of DIAGRAM_MARKER, which would end the diagram
                var x;
                for (x = xMin; (x < xMax) && (sourceString[lineBeginning + x] === DIAGRAM_MARKER); ++x) {}

                var begin = lineBeginning + xMin;
                var end = lineBeginning + xMax + wideCharacters;

                if (!textOnLeft) {
                    // This may be an incomplete line
                    var newlineLocation = sourceString.indexOf('\n', begin);
                    if (newlineLocation !== -1) {
                        end = Math.min(end, newlineLocation);
                    }
                }

                // Trim any excess whitespace caused by our truncation because Markdown will
                // interpret that as fixed-formatted lines
                result.afterString += sourceString.substring(previousEnding, begin).replace(/^[ \t]*[ \t]/, ' ').replace(/[ \t][ \t]*$/, ' ');
                if (x === xMax) {
                    // We found the last row. Put everything else into
                    // the afterString and return the result.

                    result.afterString += sourceString.substring(lineBeginning + xMax + 1);
                    return result;
                } else {
                    // A line of a diagram. Extract everything before
                    // the diagram line started into the string of
                    // content to be placed after the diagram in the
                    // final HTML
                    result.diagramString += sourceString.substring(begin + 1, end) + '\n';
                    previousEnding = end + 1;
                }
            } else {
                // Found an incorrectly delimited line. Abort
                // processing of this potential diagram, which is now
                // known to NOT be a diagram after all.
                good = false;
            }
        }
        // Iterate over verticals in the potential box
    }
    // Search for the start

    return noDiagramResult;
}











/** Converts diagramString, which is a Markdeep diagram without the surrounding asterisks, to
    SVG (HTML). Lines may have ragged lengths.

    alignmentHint is the float alignment desired for the SVG tag,
    which can be 'floatleft', 'floatright', or ''
*/
function diagramToSVG(diagramString, alignmentHint) {
    // Clean up diagramString if line endings are ragged
    diagramString = equalizeLineLengths(diagramString);

    // Temporarily replace 'o' that is surrounded by other text
    // with another character to avoid processing it as a point 
    // decoration. This will be replaced in the final svg and is
    // faster than checking each neighborhood each time.
    var HIDE_O = '\ue004';
    diagramString = diagramString.replace(/([a-zA-Z]{2})o/g, '$1' + HIDE_O);
    diagramString = diagramString.replace(/o([a-zA-Z]{2})/g, HIDE_O + '$1');
    diagramString = diagramString.replace(/([a-zA-Z\ue004])o([a-zA-Z\ue004])/g, '$1' + HIDE_O + '$2');

    /** Pixels per character */
    var SCALE = 8;

    /** Multiply Y coordinates by this when generating the final SVG
    result to account for the aspect ratio of text files. This
    MUST be 2 */
    var ASPECT = 2;

    var DIAGONAL_ANGLE = Math.atan(1.0 / ASPECT) * 180 / Math.PI;

    var EPSILON = 1e-6;

    // The order of the following is based on rotation angles
    // and is used for ArrowSet.toSVG
    var ARROW_HEAD_CHARACTERS = '>v<^';
    var POINT_CHARACTERS = 'o*◌○◍●';
    var JUMP_CHARACTERS = '()';
    var UNDIRECTED_VERTEX_CHARACTERS = "+";
    var VERTEX_CHARACTERS = UNDIRECTED_VERTEX_CHARACTERS + ".'";

    // GRAY[i] is the Unicode block character for (i+1)/4 level gray
    var GRAY_CHARACTERS = '\u2591\u2592\u2593\u2588';

    // TRI[i] is a right-triangle rotated by 90*i
    var TRI_CHARACTERS = '\u25E2\u25E3\u25E4\u25E5';

    var DECORATION_CHARACTERS = ARROW_HEAD_CHARACTERS + POINT_CHARACTERS + JUMP_CHARACTERS + GRAY_CHARACTERS + TRI_CHARACTERS;

    function isUndirectedVertex(c) {
        return UNDIRECTED_VERTEX_CHARACTERS.indexOf(c) + 1;
    }
    function isVertex(c) {
        return VERTEX_CHARACTERS.indexOf(c) !== -1;
    }
    function isTopVertex(c) {
        return isUndirectedVertex(c) || (c === '.');
    }
    function isBottomVertex(c) {
        return isUndirectedVertex(c) || (c === "'");
    }
    function isVertexOrLeftDecoration(c) {
        return isVertex(c) || (c === '<') || isPoint(c);
    }
    function isVertexOrRightDecoration(c) {
        return isVertex(c) || (c === '>') || isPoint(c);
    }
    function isArrowHead(c) {
        return ARROW_HEAD_CHARACTERS.indexOf(c) + 1;
    }
    function isGray(c) {
        return GRAY_CHARACTERS.indexOf(c) + 1;
    }
    function isTri(c) {
        return TRI_CHARACTERS.indexOf(c) + 1;
    }

    // "D" = Diagonal slash (/), "B" = diagonal Backslash (\)
    // Characters that may appear anywhere on a solid line
    function isSolidHLine(c) {
        return (c === '-') || isUndirectedVertex(c) || isJump(c);
    }
    function isSolidVLineOrJumpOrPoint(c) {
        return isSolidVLine(c) || isJump(c) || isPoint(c);
    }
    function isSolidVLine(c) {
        return (c === '|') || isUndirectedVertex(c);
    }
    function isSolidDLine(c) {
        return (c === '/') || isUndirectedVertex(c)
    }
    function isSolidBLine(c) {
        return (c === '\\') || isUndirectedVertex(c);
    }
    function isJump(c) {
        return JUMP_CHARACTERS.indexOf(c) + 1;
    }
    function isPoint(c) {
        return POINT_CHARACTERS.indexOf(c) + 1;
    }
    function isDecoration(c) {
        return DECORATION_CHARACTERS.indexOf(c) + 1;
    }
    function isEmpty(c) {
        return c === ' ';
    }

    ///////////////////////////////////////////////////////////////////////////////
    // Math library

    /** Invoke as new Vec2(v) to clone or new Vec2(x, y) to create from coordinates.
    Can also invoke without new for brevity. */
    function Vec2(x, y) {
        // Detect when being run without new
        if (!(this instanceof Vec2)) {
            return new Vec2(x,y);
        }

        if (y === undefined) {
            if (x === undefined) {
                x = y = 0;
            } else if (x instanceof Vec2) {
                y = x.y;
                x = x.x;
            } else {
                console.error("Vec2 requires one Vec2 or (x, y) as an argument");
            }
        }
        this.x = x;
        this.y = y;
        Object.seal(this);
    }

    /** Returns an SVG representation */
    Vec2.prototype.toString = Vec2.prototype.toSVG = function() {
        return '' + (this.x * SCALE) + ',' + (this.y * SCALE * ASPECT) + ' ';
    }
    ;

    /** Converts a "rectangular" string defined by newlines into 2D
    array of characters. Grids are immutable. */
    function makeGrid(str) {
        /** Returns ' ' for out of bounds values */
        var grid = function(x, y) {
            if (y === undefined) {
                if (x instanceof Vec2) {
                    y = x.y;
                    x = x.x;
                } else {
                    console.error('grid requires either a Vec2 or (x, y)');
                }
            }

            return ((x >= 0) && (x < grid.width) && (y >= 0) && (y < grid.height)) ? str[y * (grid.width + 1) + x] : ' ';
        };

        // Elements are true when consumed
        grid._used = [];

        grid.height = str.split('\n').length;
        if (str[str.length - 1] === '\n') {
            --grid.height;
        }

        // Convert the string to an array to better handle greater-than 16-bit unicode
        // characters, which JavaScript does not process correctly with indices. Do this after
        // the above string processing.
        str = Array.from(str);
        grid.width = str.indexOf('\n');

        /** Mark this location. Takes a Vec2 or (x, y) */
        grid.setUsed = function(x, y) {
            if (y === undefined) {
                if (x instanceof Vec2) {
                    y = x.y;
                    x = x.x;
                } else {
                    console.error('grid requires either a Vec2 or (x, y)');
                }
            }
            if ((x >= 0) && (x < grid.width) && (y >= 0) && (y < grid.height)) {
                // Match the source string indexing
                grid._used[y * (grid.width + 1) + x] = true;
            }
        }
        ;

        grid.isUsed = function(x, y) {
            if (y === undefined) {
                if (x instanceof Vec2) {
                    y = x.y;
                    x = x.x;
                } else {
                    console.error('grid requires either a Vec2 or (x, y)');
                }
            }
            return (this._used[y * (this.width + 1) + x] === true);
        }
        ;

        /** Returns true if there is a solid vertical line passing through (x, y) */
        grid.isSolidVLineAt = function(x, y) {
            if (y === undefined) {
                y = x.x;
                x = x.x;
            }

            var up = grid(x, y - 1);
            var c = grid(x, y);
            var dn = grid(x, y + 1);

            var uprt = grid(x + 1, y - 1);
            var uplt = grid(x - 1, y - 1);

            if (isSolidVLine(c)) {
                // Looks like a vertical line...does it continue?
                return (isTopVertex(up) || (up === '^') || isSolidVLine(up) || isJump(up) || isBottomVertex(dn) || (dn === 'v') || isSolidVLine(dn) || isJump(dn) || isPoint(up) || isPoint(dn) || (grid(x, y - 1) === '_') || (uplt === '_') || (uprt === '_') ||
                // Special case of 1-high vertical on two curved corners 
                ((isTopVertex(uplt) || isTopVertex(uprt)) && (isBottomVertex(grid(x - 1, y + 1)) || isBottomVertex(grid(x + 1, y + 1)))));

            } else if (isTopVertex(c) || (c === '^')) {
                // May be the top of a vertical line
                return isSolidVLine(dn) || (isJump(dn) && (c !== '.'));
            } else if (isBottomVertex(c) || (c === 'v')) {
                return isSolidVLine(up) || (isJump(up) && (c !== "'"));
            } else if (isPoint(c)) {
                return isSolidVLine(up) || isSolidVLine(dn);
            }

            return false;
        }
        ;

        /** Returns true if there is a solid middle (---) horizontal line
        passing through (x, y). Ignores underscores. */
        grid.isSolidHLineAt = function(x, y) {
            if (y === undefined) {
                y = x.x;
                x = x.x;
            }

            var ltlt = grid(x - 2, y);
            var lt = grid(x - 1, y);
            var c = grid(x + 0, y);
            var rt = grid(x + 1, y);
            var rtrt = grid(x + 2, y);

            if (isSolidHLine(c) || (isSolidHLine(lt) && isJump(c))) {
                // Looks like a horizontal line...does it continue? We need three in a row.
                if (isSolidHLine(lt)) {
                    return isSolidHLine(rt) || isVertexOrRightDecoration(rt) || isSolidHLine(ltlt) || isVertexOrLeftDecoration(ltlt);
                } else if (isVertexOrLeftDecoration(lt)) {
                    return isSolidHLine(rt);
                } else {
                    return isSolidHLine(rt) && (isSolidHLine(rtrt) || isVertexOrRightDecoration(rtrt));
                }

            } else if (c === '<') {
                return isSolidHLine(rt) && isSolidHLine(rtrt)

            } else if (c === '>') {
                return isSolidHLine(lt) && isSolidHLine(ltlt);

            } else if (isVertex(c)) {
                return ((isSolidHLine(lt) && isSolidHLine(ltlt)) || (isSolidHLine(rt) && isSolidHLine(rtrt)));
            }

            return false;
        }
        ;

        /** Returns true if there is a solid backslash line passing through (x, y) */
        grid.isSolidBLineAt = function(x, y) {
            if (y === undefined) {
                y = x.x;
                x = x.x;
            }
            var c = grid(x, y);
            var lt = grid(x - 1, y - 1);
            var rt = grid(x + 1, y + 1);

            if (c === '\\') {
                // Looks like a diagonal line...does it continue? We need two in a row.
                return (isSolidBLine(rt) || isBottomVertex(rt) || isPoint(rt) || (rt === 'v') || isSolidBLine(lt) || isTopVertex(lt) || isPoint(lt) || (lt === '^') || (grid(x, y - 1) === '/') || (grid(x, y + 1) === '/') || (rt === '_') || (lt === '_'));
            } else if (c === '.') {
                return (rt === '\\');
            } else if (c === "'") {
                return (lt === '\\');
            } else if (c === '^') {
                return rt === '\\';
            } else if (c === 'v') {
                return lt === '\\';
            } else if (isVertex(c) || isPoint(c) || (c === '|')) {
                return isSolidBLine(lt) || isSolidBLine(rt);
            }
        }
        ;

        /** Returns true if there is a solid diagonal line passing through (x, y) */
        grid.isSolidDLineAt = function(x, y) {
            if (y === undefined) {
                y = x.x;
                x = x.x;
            }

            var c = grid(x, y);
            var lt = grid(x - 1, y + 1);
            var rt = grid(x + 1, y - 1);

            if (c === '/' && ((grid(x, y - 1) === '\\') || (grid(x, y + 1) === '\\'))) {
                // Special case of tiny hexagon corner
                return true;
            } else if (isSolidDLine(c)) {
                // Looks like a diagonal line...does it continue? We need two in a row.
                return (isSolidDLine(rt) || isTopVertex(rt) || isPoint(rt) || (rt === '^') || (rt === '_') || isSolidDLine(lt) || isBottomVertex(lt) || isPoint(lt) || (lt === 'v') || (lt === '_'));
            } else if (c === '.') {
                return (lt === '/');
            } else if (c === "'") {
                return (rt === '/');
            } else if (c === '^') {
                return lt === '/';
            } else if (c === 'v') {
                return rt === '/';
            } else if (isVertex(c) || isPoint(c) || (c === '|')) {
                return isSolidDLine(lt) || isSolidDLine(rt);
            }
            return false;
        }
        ;

        grid.toString = function() {
            return str;
        }
        ;

        return Object.freeze(grid);
    }

    /** A 1D curve. If C is specified, the result is a bezier with
    that as the tangent control point */
    function Path(A, B, C, D, dashed) {
        if (!((A instanceof Vec2) && (B instanceof Vec2))) {
            console.error('Path constructor requires at least two Vec2s');
        }
        this.A = A;
        this.B = B;
        if (C) {
            this.C = C;
            if (D) {
                this.D = D;
            } else {
                this.D = C;
            }
        }

        this.dashed = dashed || false;

        Object.freeze(this);
    }

    var _ = Path.prototype;
    _.isVertical = function() {
        return this.B.x === this.A.x;
    }
    ;

    _.isHorizontal = function() {
        return this.B.y === this.A.y;
    }
    ;

    /** Diagonal lines look like: / See also backDiagonal */
    _.isDiagonal = function() {
        var dx = this.B.x - this.A.x;
        var dy = this.B.y - this.A.y;
        return (abs(dy + dx) < EPSILON);
    }
    ;

    _.isBackDiagonal = function() {
        var dx = this.B.x - this.A.x;
        var dy = this.B.y - this.A.y;
        return (abs(dy - dx) < EPSILON);
    }
    ;

    _.isCurved = function() {
        return this.C !== undefined;
    }
    ;

    /** Does this path have any end at (x, y) */
    _.endsAt = function(x, y) {
        if (y === undefined) {
            y = x.y;
            x = x.x;
        }
        return ((this.A.x === x) && (this.A.y === y)) || ((this.B.x === x) && (this.B.y === y));
    }
    ;

    /** Does this path have an up end at (x, y) */
    _.upEndsAt = function(x, y) {
        if (y === undefined) {
            y = x.y;
            x = x.x;
        }
        return this.isVertical() && (this.A.x === x) && (Math.min(this.A.y, this.B.y) === y);
    }
    ;

    /** Does this path have an up end at (x, y) */
    _.diagonalUpEndsAt = function(x, y) {
        if (!this.isDiagonal()) {
            return false;
        }
        if (y === undefined) {
            y = x.y;
            x = x.x;
        }
        if (this.A.y < this.B.y) {
            return (this.A.x === x) && (this.A.y === y);
        } else {
            return (this.B.x === x) && (this.B.y === y);
        }
    }
    ;

    /** Does this path have a down end at (x, y) */
    _.diagonalDownEndsAt = function(x, y) {
        if (!this.isDiagonal()) {
            return false;
        }
        if (y === undefined) {
            y = x.y;
            x = x.x;
        }
        if (this.B.y < this.A.y) {
            return (this.A.x === x) && (this.A.y === y);
        } else {
            return (this.B.x === x) && (this.B.y === y);
        }
    }
    ;

    /** Does this path have an up end at (x, y) */
    _.backDiagonalUpEndsAt = function(x, y) {
        if (!this.isBackDiagonal()) {
            return false;
        }
        if (y === undefined) {
            y = x.y;
            x = x.x;
        }
        if (this.A.y < this.B.y) {
            return (this.A.x === x) && (this.A.y === y);
        } else {
            return (this.B.x === x) && (this.B.y === y);
        }
    }
    ;

    /** Does this path have a down end at (x, y) */
    _.backDiagonalDownEndsAt = function(x, y) {
        if (!this.isBackDiagonal()) {
            return false;
        }
        if (y === undefined) {
            y = x.y;
            x = x.x;
        }
        if (this.B.y < this.A.y) {
            return (this.A.x === x) && (this.A.y === y);
        } else {
            return (this.B.x === x) && (this.B.y === y);
        }
    }
    ;

    /** Does this path have a down end at (x, y) */
    _.downEndsAt = function(x, y) {
        if (y === undefined) {
            y = x.y;
            x = x.x;
        }
        return this.isVertical() && (this.A.x === x) && (Math.max(this.A.y, this.B.y) === y);
    }
    ;

    /** Does this path have a left end at (x, y) */
    _.leftEndsAt = function(x, y) {
        if (y === undefined) {
            y = x.y;
            x = x.x;
        }
        return this.isHorizontal() && (this.A.y === y) && (Math.min(this.A.x, this.B.x) === x);
    }
    ;

    /** Does this path have a right end at (x, y) */
    _.rightEndsAt = function(x, y) {
        if (y === undefined) {
            y = x.y;
            x = x.x;
        }
        return this.isHorizontal() && (this.A.y === y) && (Math.max(this.A.x, this.B.x) === x);
    }
    ;

    _.verticalPassesThrough = function(x, y) {
        if (y === undefined) {
            y = x.y;
            x = x.x;
        }
        return this.isVertical() && (this.A.x === x) && (Math.min(this.A.y, this.B.y) <= y) && (Math.max(this.A.y, this.B.y) >= y);
    }

    _.horizontalPassesThrough = function(x, y) {
        if (y === undefined) {
            y = x.y;
            x = x.x;
        }
        return this.isHorizontal() && (this.A.y === y) && (Math.min(this.A.x, this.B.x) <= x) && (Math.max(this.A.x, this.B.x) >= x);
    }

    /** Returns a string suitable for inclusion in an SVG tag */
    _.toSVG = function() {
        var svg = '<path d="M ' + this.A;

        if (this.isCurved()) {
            svg += 'C ' + this.C + this.D + this.B;
        } else {
            svg += 'L ' + this.B;
        }
        svg += '" style="fill:none;"';
        if (this.dashed) {
            svg += ' stroke-dasharray="3,6"';
        }
        svg += '/>';
        return svg;
    }
    ;

    /** A group of 1D curves. This was designed so that all of the
    methods can later be implemented in O(1) time, but it
    currently uses O(n) implementations for source code
    simplicity. */
    function PathSet() {
        this._pathArray = [];
    }

    var PS = PathSet.prototype;
    PS.insert = function(path) {
        this._pathArray.push(path);
    }
    ;

    /** Returns a new method that returns true if method(x, y) 
    returns true on any element of _pathAray */
    function makeFilterAny(method) {
        return function(x, y) {
            for (var i = 0; i < this._pathArray.length; ++i) {
                if (method.call(this._pathArray[i], x, y)) {
                    return true;
                }
            }
            // Fall through: return undefined == false
        }
    }

    // True if an up line ends at these coordinates. Recall that the
    // variable _ is bound to the Path prototype still.
    PS.upEndsAt = makeFilterAny(_.upEndsAt);
    PS.diagonalUpEndsAt = makeFilterAny(_.diagonalUpEndsAt);
    PS.backDiagonalUpEndsAt = makeFilterAny(_.backDiagonalUpEndsAt);
    PS.diagonalDownEndsAt = makeFilterAny(_.diagonalDownEndsAt);
    PS.backDiagonalDownEndsAt = makeFilterAny(_.backDiagonalDownEndsAt);
    PS.downEndsAt = makeFilterAny(_.downEndsAt);
    PS.leftEndsAt = makeFilterAny(_.leftEndsAt);
    PS.rightEndsAt = makeFilterAny(_.rightEndsAt);
    PS.endsAt = makeFilterAny(_.endsAt);
    PS.verticalPassesThrough = makeFilterAny(_.verticalPassesThrough);
    PS.horizontalPassesThrough = makeFilterAny(_.horizontalPassesThrough);

    /** Returns an SVG string */
    PS.toSVG = function() {
        var svg = '';
        for (var i = 0; i < this._pathArray.length; ++i) {
            svg += this._pathArray[i].toSVG() + '\n';
        }
        return svg;
    }
    ;

    function DecorationSet() {
        this._decorationArray = [];
    }

    var DS = DecorationSet.prototype;

    /** insert(x, y, type, <angle>)  
    insert(vec, type, <angle>)

    angle is the angle in degrees to rotate the result */
    DS.insert = function(x, y, type, angle) {
        if (type === undefined) {
            type = y;
            y = x.y;
            x = x.x;
        }

        if (!isDecoration(type)) {
            console.error('Illegal decoration character: ' + type);
        }
        var d = {
            C: Vec2(x, y),
            type: type,
            angle: angle || 0
        };

        // Put arrows at the front and points at the back so that
        // arrows always draw under points

        if (isPoint(type)) {
            this._decorationArray.push(d);
        } else {
            this._decorationArray.unshift(d);
        }
    }
    ;

    DS.toSVG = function() {
        var svg = '';
        for (var i = 0; i < this._decorationArray.length; ++i) {
            var decoration = this._decorationArray[i];
            var C = decoration.C;

            if (isJump(decoration.type)) {
                // Slide jumps
                var dx = (decoration.type === ')') ? +0.75 : -0.75;
                var up = Vec2(C.x, C.y - 0.5);
                var dn = Vec2(C.x, C.y + 0.5);
                var cup = Vec2(C.x + dx, C.y - 0.5);
                var cdn = Vec2(C.x + dx, C.y + 0.5);

                svg += '<path d="M ' + dn + ' C ' + cdn + cup + up + '" style="fill:none;"/>';

            } else if (isPoint(decoration.type)) {
                var cls = {
                    '*': 'closed',
                    'o': 'open',
                    '◌': 'dotted',
                    '○': 'open',
                    '◍': 'shaded',
                    '●': 'closed'
                }[decoration.type];
                svg += '<circle cx="' + (C.x * SCALE) + '" cy="' + (C.y * SCALE * ASPECT) + '" r="' + (SCALE - STROKE_WIDTH) + '" class="' + cls + 'dot"/>';
            } else if (isGray(decoration.type)) {

                var shade = Math.round((3 - GRAY_CHARACTERS.indexOf(decoration.type)) * 63.75);
                svg += '<rect x="' + ((C.x - 0.5) * SCALE) + '" y="' + ((C.y - 0.5) * SCALE * ASPECT) + '" width="' + SCALE + '" height="' + (SCALE * ASPECT) + '" stroke=none fill="rgb(' + shade + ',' + shade + ',' + shade + ')"/>';

            } else if (isTri(decoration.type)) {
                // 30-60-90 triangle
                var index = TRI_CHARACTERS.indexOf(decoration.type);
                var xs = 0.5 - (index & 1);
                var ys = 0.5 - (index >> 1);
                xs *= sign(ys);
                var tip = Vec2(C.x + xs, C.y - ys);
                var up = Vec2(C.x + xs, C.y + ys);
                var dn = Vec2(C.x - xs, C.y + ys);
                svg += '<polygon points="' + tip + up + dn + '" style="stroke:none"/>\n';
            } else {
                // Arrow head
                var tip = Vec2(C.x + 1, C.y);
                var up = Vec2(C.x - 0.5, C.y - 0.35);
                var dn = Vec2(C.x - 0.5, C.y + 0.35);
                svg += '<polygon points="' + tip + up + dn + '"  style="stroke:none" transform="rotate(' + decoration.angle + ',' + C + ')"/>\n';
            }
        }
        return svg;
    }
    ;

    ////////////////////////////////////////////////////////////////////////////

    function findPaths(grid, pathSet) {
        // Does the line from A to B contain at least one c?
        function lineContains(A, B, c) {
            var dx = Math.sign(B.x - A.x);
            var dy = Math.sign(B.y - A.y);
            var x, y;

            for (x = A.x,
            y = A.y; (x !== B.x) || (y !== B.y); x += dx,
            y += dy) {
                if (grid(x, y) === c) {
                    return true;
                }
            }

            // Last point
            return (grid(x, y) === c);
        }

        // Find all solid vertical lines. Iterate horizontally
        // so that we never hit the same line twice
        for (var x = 0; x < grid.width; ++x) {
            for (var y = 0; y < grid.height; ++y) {
                if (grid.isSolidVLineAt(x, y)) {
                    // This character begins a vertical line...now, find the end
                    var A = Vec2(x, y);
                    do {
                        grid.setUsed(x, y);
                        ++y;
                    } while (grid.isSolidVLineAt(x, y));var B = Vec2(x, y - 1);

                    var up = grid(A);
                    var upup = grid(A.x, A.y - 1);

                    if (!isVertex(up) && ((upup === '-') || (upup === '_') || (upup === '┳') || (grid(A.x - 1, A.y - 1) === '_') || (grid(A.x + 1, A.y - 1) === '_') || isBottomVertex(upup)) || isJump(upup)) {
                        // Stretch up to almost reach the line above (if there is a decoration,
                        // it will finish the gap)
                        A.y -= 0.5;
                    }

                    var dn = grid(B);
                    var dndn = grid(B.x, B.y + 1);
                    if (!isVertex(dn) && ((dndn === '-') || (dndn === '┻') || isTopVertex(dndn)) || isJump(dndn) || (grid(B.x - 1, B.y) === '_') || (grid(B.x + 1, B.y) === '_')) {
                        // Stretch down to almost reach the line below
                        B.y += 0.5;
                    }

                    // Don't insert degenerate lines
                    if ((A.x !== B.x) || (A.y !== B.y)) {
                        pathSet.insert(new Path(A,B));
                    }

                    // Continue the search from the end value y+1
                }
                // Some very special patterns for the short lines needed on
                // circuit diagrams. Only invoke these if not also on a curve
                //      _  _    
                //    -'    '-   -'
                else if ((grid(x, y) === "'") && (((grid(x - 1, y) === '-') && (grid(x + 1, y - 1) === '_') && !isSolidVLineOrJumpOrPoint(grid(x - 1, y - 1))) || ((grid(x - 1, y - 1) === '_') && (grid(x + 1, y) === '-') && !isSolidVLineOrJumpOrPoint(grid(x + 1, y - 1))))) {
                    pathSet.insert(new Path(Vec2(x, y - 0.5),Vec2(x, y)));
                }
                //    _.-  -._  
                else if ((grid(x, y) === '.') && (((grid(x - 1, y) === '_') && (grid(x + 1, y) === '-') && !isSolidVLineOrJumpOrPoint(grid(x + 1, y + 1))) || ((grid(x - 1, y) === '-') && (grid(x + 1, y) === '_') && !isSolidVLineOrJumpOrPoint(grid(x - 1, y + 1))))) {
                    pathSet.insert(new Path(Vec2(x, y),Vec2(x, y + 0.5)));
                }
                // For drawing resistors: -.╱
                else if ((grid(x, y) === '.') && (grid(x - 1, y) === '-') && (grid(x + 1, y) === '╱')) {
                    pathSet.insert(new Path(Vec2(x, y),Vec2(x + 0.5, y + 0.5)));
                }
                // For drawing resistors: ╱'-
                else if ((grid(x, y) === "'") && (grid(x + 1, y) === '-') && (grid(x - 1, y) === '╱')) {
                    pathSet.insert(new Path(Vec2(x, y),Vec2(x - 0.5, y - 0.5)));
                }

            }
            // y
        }
        // x

        // Find all solid horizontal lines 
        for (var y = 0; y < grid.height; ++y) {
            for (var x = 0; x < grid.width; ++x) {
                if (grid.isSolidHLineAt(x, y)) {
                    // Begins a line...find the end
                    var A = Vec2(x, y);
                    do {
                        grid.setUsed(x, y);
                        ++x;
                    } while (grid.isSolidHLineAt(x, y));var B = Vec2(x - 1, y);

                    // Detect adjacent box-drawing characters and lengthen the edge
                    if (grid(B.x + 1, B.y) === '┫') {
                        B.x += 0.5;
                    }
                    if (grid(A.x - 1, A.y) === '┣') {
                        A.x -= 0.5;
                    }

                    // Detect curves and shorten the edge
                    if (!isVertex(grid(A.x - 1, A.y)) && ((isTopVertex(grid(A)) && isSolidVLineOrJumpOrPoint(grid(A.x - 1, A.y + 1))) || (isBottomVertex(grid(A)) && isSolidVLineOrJumpOrPoint(grid(A.x - 1, A.y - 1))))) {
                        ++A.x;
                    }

                    if (!isVertex(grid(B.x + 1, B.y)) && ((isTopVertex(grid(B)) && isSolidVLineOrJumpOrPoint(grid(B.x + 1, B.y + 1))) || (isBottomVertex(grid(B)) && isSolidVLineOrJumpOrPoint(grid(B.x + 1, B.y - 1))))) {
                        --B.x;
                    }

                    // Only insert non-degenerate lines
                    if ((A.x !== B.x) || (A.y !== B.y)) {
                        pathSet.insert(new Path(A,B));
                    }

                    // Continue the search from the end x+1
                }
            }
        }
        // y

        // Find all solid left-to-right downward diagonal lines (BACK DIAGONAL)
        for (var i = -grid.height; i < grid.width; ++i) {
            for (var x = i, y = 0; y < grid.height; ++y,
            ++x) {
                if (grid.isSolidBLineAt(x, y)) {
                    // Begins a line...find the end
                    var A = Vec2(x, y);
                    do {
                        ++x;
                        ++y;
                    } while (grid.isSolidBLineAt(x, y));var B = Vec2(x - 1, y - 1);

                    // Ensure that the entire line wasn't just vertices
                    if (lineContains(A, B, '\\')) {
                        for (var j = A.x; j <= B.x; ++j) {
                            grid.setUsed(j, A.y + (j - A.x));
                        }

                        var top = grid(A);
                        var up = grid(A.x, A.y - 1);
                        var uplt = grid(A.x - 1, A.y - 1);
                        if ((up === '/') || (uplt === '_') || (up === '_') || (!isVertex(top) && (isSolidHLine(uplt) || isSolidVLine(uplt)))) {
                            // Continue half a cell more to connect for:
                            //  ___   ___
                            //  \        \    /      ----     |
                            //   \        \   \        ^      |^
                            A.x -= 0.5;
                            A.y -= 0.5;
                        } else if (isPoint(uplt)) {
                            // Continue 1/4 cell more to connect for:
                            //
                            //  o
                            //   ^
                            //    \
                            A.x -= 0.25;
                            A.y -= 0.25;
                        }

                        var bottom = grid(B);
                        var dnrt = grid(B.x + 1, B.y + 1);
                        if ((grid(B.x, B.y + 1) === '/') || (grid(B.x + 1, B.y) === '_') || (grid(B.x - 1, B.y) === '_') || (!isVertex(grid(B)) && (isSolidHLine(dnrt) || isSolidVLine(dnrt)))) {
                            // Continue half a cell more to connect for:
                            //                       \      \ |
                            //  \       \     \       v      v|
                            //   \__   __\    /      ----     |

                            B.x += 0.5;
                            B.y += 0.5;
                        } else if (isPoint(dnrt)) {
                            // Continue 1/4 cell more to connect for:
                            //
                            //    \
                            //     v
                            //      o

                            B.x += 0.25;
                            B.y += 0.25;
                        }

                        pathSet.insert(new Path(A,B));
                        // Continue the search from the end x+1,y+1
                    }
                    // lineContains
                }
            }
        }
        // i

        // Find all solid left-to-right upward diagonal lines (DIAGONAL)
        for (var i = -grid.height; i < grid.width; ++i) {
            for (var x = i, y = grid.height - 1; y >= 0; --y,
            ++x) {
                if (grid.isSolidDLineAt(x, y)) {
                    // Begins a line...find the end
                    var A = Vec2(x, y);
                    do {
                        ++x;
                        --y;
                    } while (grid.isSolidDLineAt(x, y));var B = Vec2(x - 1, y + 1);

                    if (lineContains(A, B, '/')) {
                        // This is definitely a line. Commit the characters on it
                        for (var j = A.x; j <= B.x; ++j) {
                            grid.setUsed(j, A.y - (j - A.x));
                        }

                        var up = grid(B.x, B.y - 1);
                        var uprt = grid(B.x + 1, B.y - 1);
                        var bottom = grid(B);
                        if ((up === '\\') || (up === '_') || (uprt === '_') || (!isVertex(grid(B)) && (isSolidHLine(uprt) || isSolidVLine(uprt)))) {

                            // Continue half a cell more to connect at:
                            //     __   __  ---     |
                            //    /      /   ^     ^|
                            //   /      /   /     / |

                            B.x += 0.5;
                            B.y -= 0.5;
                        } else if (isPoint(uprt)) {

                            // Continue 1/4 cell more to connect at:
                            //
                            //       o
                            //      ^
                            //     /

                            B.x += 0.25;
                            B.y -= 0.25;
                        }

                        var dnlt = grid(A.x - 1, A.y + 1);
                        var top = grid(A);
                        if ((grid(A.x, A.y + 1) === '\\') || (grid(A.x - 1, A.y) === '_') || (grid(A.x + 1, A.y) === '_') || (!isVertex(grid(A)) && (isSolidHLine(dnlt) || isSolidVLine(dnlt)))) {

                            // Continue half a cell more to connect at:
                            //               /     \ |
                            //    /  /      v       v|
                            // __/  /__   ----       | 

                            A.x -= 0.5;
                            A.y += 0.5;
                        } else if (isPoint(dnlt)) {

                            // Continue 1/4 cell more to connect at:
                            //
                            //       /
                            //      v
                            //     o

                            A.x -= 0.25;
                            A.y += 0.25;
                        }
                        pathSet.insert(new Path(A,B));

                        // Continue the search from the end x+1,y-1
                    }
                    // lineContains
                }
            }
        }
        // y

        // Now look for curved corners. The syntax constraints require
        // that these can always be identified by looking at three
        // horizontally-adjacent characters.
        for (var y = 0; y < grid.height; ++y) {
            for (var x = 0; x < grid.width; ++x) {
                var c = grid(x, y);

                // Note that because of undirected vertices, the
                // following cases are not exclusive
                if (isTopVertex(c)) {
                    // -.
                    //   |
                    if (isSolidHLine(grid(x - 1, y)) && isSolidVLine(grid(x + 1, y + 1))) {
                        grid.setUsed(x - 1, y);
                        grid.setUsed(x, y);
                        grid.setUsed(x + 1, y + 1);
                        pathSet.insert(new Path(Vec2(x - 1, y),Vec2(x + 1, y + 1),Vec2(x + 1.1, y),Vec2(x + 1, y + 1)));
                    }

                    //  .-
                    // |
                    if (isSolidHLine(grid(x + 1, y)) && isSolidVLine(grid(x - 1, y + 1))) {
                        grid.setUsed(x - 1, y + 1);
                        grid.setUsed(x, y);
                        grid.setUsed(x + 1, y);
                        pathSet.insert(new Path(Vec2(x + 1, y),Vec2(x - 1, y + 1),Vec2(x - 1.1, y),Vec2(x - 1, y + 1)));
                    }
                }

                // Special case patterns:
                //   .  .   .  .    
                //  (  o     )  o
                //   '  .   '  '
                if (((c === ')') || isPoint(c)) && (grid(x - 1, y - 1) === '.') && (grid(x - 1, y + 1) === "\'")) {
                    grid.setUsed(x, y);
                    grid.setUsed(x - 1, y - 1);
                    grid.setUsed(x - 1, y + 1);
                    pathSet.insert(new Path(Vec2(x - 2, y - 1),Vec2(x - 2, y + 1),Vec2(x + 0.6, y - 1),Vec2(x + 0.6, y + 1)));
                }

                if (((c === '(') || isPoint(c)) && (grid(x + 1, y - 1) === '.') && (grid(x + 1, y + 1) === "\'")) {
                    grid.setUsed(x, y);
                    grid.setUsed(x + 1, y - 1);
                    grid.setUsed(x + 1, y + 1);
                    pathSet.insert(new Path(Vec2(x + 2, y - 1),Vec2(x + 2, y + 1),Vec2(x - 0.6, y - 1),Vec2(x - 0.6, y + 1)));
                }

                if (isBottomVertex(c)) {
                    //   |
                    // -' 
                    if (isSolidHLine(grid(x - 1, y)) && isSolidVLine(grid(x + 1, y - 1))) {
                        grid.setUsed(x - 1, y);
                        grid.setUsed(x, y);
                        grid.setUsed(x + 1, y - 1);
                        pathSet.insert(new Path(Vec2(x - 1, y),Vec2(x + 1, y - 1),Vec2(x + 1.1, y),Vec2(x + 1, y - 1)));
                    }

                    // | 
                    //  '-
                    if (isSolidHLine(grid(x + 1, y)) && isSolidVLine(grid(x - 1, y - 1))) {
                        grid.setUsed(x - 1, y - 1);
                        grid.setUsed(x, y);
                        grid.setUsed(x + 1, y);
                        pathSet.insert(new Path(Vec2(x + 1, y),Vec2(x - 1, y - 1),Vec2(x - 1.1, y),Vec2(x - 1, y - 1)));
                    }
                }

            }
            // for x
        }
        // for y

        // Find low horizontal lines marked with underscores. These
        // are so simple compared to the other cases that we process
        // them directly here without a helper function. Process these
        // from top to bottom and left to right so that we can read
        // them in a single sweep.
        // 
        // Exclude the special case of double underscores going right
        // into an ASCII character, which could be a source code
        // identifier such as __FILE__ embedded in the diagram.
        for (var y = 0; y < grid.height; ++y) {
            for (var x = 0; x < grid.width - 2; ++x) {
                var lt = grid(x - 1, y);

                if ((grid(x, y) === '_') && (grid(x + 1, y) === '_') && (!isASCIILetter(grid(x + 2, y)) || (lt === '_')) && (!isASCIILetter(lt) || (grid(x + 2, y) === '_'))) {

                    var ltlt = grid(x - 2, y);
                    var A = Vec2(x - 0.5, y + 0.5);

                    if ((lt === '|') || (grid(x - 1, y + 1) === '|') || (lt === '.') || (grid(x - 1, y + 1) === "'")) {
                        // Extend to meet adjacent vertical
                        A.x -= 0.5;

                        // Very special case of overrunning into the side of a curve,
                        // needed for logic gate diagrams
                        if ((lt === '.') && ((ltlt === '-') || (ltlt === '.')) && (grid(x - 2, y + 1) === '(')) {
                            A.x -= 0.5;
                        }
                    } else if (lt === '/') {
                        A.x -= 1.0;
                    }

                    // Detect overrun of a tight double curve
                    if ((lt === '(') && (ltlt === '(') && (grid(x, y + 1) === "'") && (grid(x, y - 1) === '.')) {
                        A.x += 0.5;
                    }
                    lt = ltlt = undefined;

                    do {
                        grid.setUsed(x, y);
                        ++x;
                    } while (grid(x, y) === '_');
                    var B = Vec2(x - 0.5, y + 0.5);
                    var c = grid(x, y);
                    var rt = grid(x + 1, y);
                    var dn = grid(x, y + 1);

                    if ((c === '|') || (dn === '|') || (c === '.') || (dn === "'")) {
                        // Extend to meet adjacent vertical
                        B.x += 0.5;

                        // Very special case of overrunning into the side of a curve,
                        // needed for logic gate diagrams
                        if ((c === '.') && ((rt === '-') || (rt === '.')) && (grid(x + 1, y + 1) === ')')) {
                            B.x += 0.5;
                        }
                    } else if ((c === '\\')) {
                        B.x += 1.0;
                    }

                    // Detect overrun of a tight double curve
                    if ((c === ')') && (rt === ')') && (grid(x - 1, y + 1) === "'") && (grid(x - 1, y - 1) === '.')) {
                        B.x += -0.5;
                    }

                    pathSet.insert(new Path(A,B));
                }
            }
            // for x
        }
        // for y
    }
    // findPaths

    function findDecorations(grid, pathSet, decorationSet) {
        function isEmptyOrVertex(c) {
            return (c === ' ') || /[^a-zA-Z0-9]|[ov]/.test(c);
        }
        function isLetter(c) {
            var x = c.toUpperCase().charCodeAt(0);
            return (x > 64) && (x < 91);
        }

        /** Is the point in the center of these values on a line? Allow points that are vertically
        adjacent but not horizontally--they wouldn't fit anyway, and might be text. */
        function onLine(up, dn, lt, rt) {
            return ((isEmptyOrVertex(dn) || isPoint(dn)) && (isEmptyOrVertex(up) || isPoint(up)) && isEmptyOrVertex(rt) && isEmptyOrVertex(lt));
        }

        for (var x = 0; x < grid.width; ++x) {
            for (var j = 0; j < grid.height; ++j) {
                var c = grid(x, j);
                var y = j;

                if (isJump(c)) {

                    // Ensure that this is really a jump and not a stray character
                    if (pathSet.downEndsAt(x, y - 0.5) && pathSet.upEndsAt(x, y + 0.5)) {
                        decorationSet.insert(x, y, c);
                        grid.setUsed(x, y);
                    }

                } else if (isPoint(c)) {
                    var up = grid(x, y - 1);
                    var dn = grid(x, y + 1);
                    var lt = grid(x - 1, y);
                    var rt = grid(x + 1, y);
                    var llt = grid(x - 2, y);
                    var rrt = grid(x + 2, y);

                    if (pathSet.rightEndsAt(x - 1, y) || // Must be at the end of a line...
                    pathSet.leftEndsAt(x + 1, y) || // or completely isolated NSEW
                    pathSet.downEndsAt(x, y - 1) || pathSet.upEndsAt(x, y + 1) ||
                    pathSet.upEndsAt(x, y) || // For points on vertical lines 
                    pathSet.downEndsAt(x, y) || // that are surrounded by other characters

                    onLine(up, dn, lt, rt)) {

                        decorationSet.insert(x, y, c);
                        grid.setUsed(x, y);
                    }
                } else if (isGray(c)) {
                    decorationSet.insert(x, y, c);
                    grid.setUsed(x, y);
                } else if (isTri(c)) {
                    decorationSet.insert(x, y, c);
                    grid.setUsed(x, y);
                } else {
                    // Arrow heads

                    // If we find one, ensure that it is really an
                    // arrow head and not a stray character by looking
                    // for a connecting line.
                    var dx = 0;
                    if ((c === '>') && (pathSet.rightEndsAt(x, y) || pathSet.horizontalPassesThrough(x, y))) {
                        if (isPoint(grid(x + 1, y))) {
                            // Back up if connecting to a point so as to not
                            // overlap it
                            dx = -0.5;
                        }
                        decorationSet.insert(x + dx, y, '>', 0);
                        grid.setUsed(x, y);
                    } else if ((c === '<') && (pathSet.leftEndsAt(x, y) || pathSet.horizontalPassesThrough(x, y))) {
                        if (isPoint(grid(x - 1, y))) {
                            // Back up if connecting to a point so as to not
                            // overlap it
                            dx = 0.5;
                        }
                        decorationSet.insert(x + dx, y, '>', 180);
                        grid.setUsed(x, y);
                    } else if (c === '^') {
                        // Because of the aspect ratio, we need to look
                        // in two slots for the end of the previous line
                        if (pathSet.upEndsAt(x, y - 0.5)) {
                            decorationSet.insert(x, y - 0.5, '>', 270);
                            grid.setUsed(x, y);
                        } else if (pathSet.upEndsAt(x, y)) {
                            decorationSet.insert(x, y, '>', 270);
                            grid.setUsed(x, y);
                        } else if (pathSet.diagonalUpEndsAt(x + 0.5, y - 0.5)) {
                            decorationSet.insert(x + 0.5, y - 0.5, '>', 270 + DIAGONAL_ANGLE);
                            grid.setUsed(x, y);
                        } else if (pathSet.diagonalUpEndsAt(x + 0.25, y - 0.25)) {
                            decorationSet.insert(x + 0.25, y - 0.25, '>', 270 + DIAGONAL_ANGLE);
                            grid.setUsed(x, y);
                        } else if (pathSet.diagonalUpEndsAt(x, y)) {
                            decorationSet.insert(x, y, '>', 270 + DIAGONAL_ANGLE);
                            grid.setUsed(x, y);
                        } else if (pathSet.backDiagonalUpEndsAt(x, y)) {
                            decorationSet.insert(x, y, c, 270 - DIAGONAL_ANGLE);
                            grid.setUsed(x, y);
                        } else if (pathSet.backDiagonalUpEndsAt(x - 0.5, y - 0.5)) {
                            decorationSet.insert(x - 0.5, y - 0.5, c, 270 - DIAGONAL_ANGLE);
                            grid.setUsed(x, y);
                        } else if (pathSet.backDiagonalUpEndsAt(x - 0.25, y - 0.25)) {
                            decorationSet.insert(x - 0.25, y - 0.25, c, 270 - DIAGONAL_ANGLE);
                            grid.setUsed(x, y);
                        } else if (pathSet.verticalPassesThrough(x, y)) {
                            // Only try this if all others failed
                            decorationSet.insert(x, y - 0.5, '>', 270);
                            grid.setUsed(x, y);
                        }
                    } else if (c === 'v') {
                        if (pathSet.downEndsAt(x, y + 0.5)) {
                            decorationSet.insert(x, y + 0.5, '>', 90);
                            grid.setUsed(x, y);
                        } else if (pathSet.downEndsAt(x, y)) {
                            decorationSet.insert(x, y, '>', 90);
                            grid.setUsed(x, y);
                        } else if (pathSet.diagonalDownEndsAt(x, y)) {
                            decorationSet.insert(x, y, '>', 90 + DIAGONAL_ANGLE);
                            grid.setUsed(x, y);
                        } else if (pathSet.diagonalDownEndsAt(x - 0.5, y + 0.5)) {
                            decorationSet.insert(x - 0.5, y + 0.5, '>', 90 + DIAGONAL_ANGLE);
                            grid.setUsed(x, y);
                        } else if (pathSet.diagonalDownEndsAt(x - 0.25, y + 0.25)) {
                            decorationSet.insert(x - 0.25, y + 0.25, '>', 90 + DIAGONAL_ANGLE);
                            grid.setUsed(x, y);
                        } else if (pathSet.backDiagonalDownEndsAt(x, y)) {
                            decorationSet.insert(x, y, '>', 90 - DIAGONAL_ANGLE);
                            grid.setUsed(x, y);
                        } else if (pathSet.backDiagonalDownEndsAt(x + 0.5, y + 0.5)) {
                            decorationSet.insert(x + 0.5, y + 0.5, '>', 90 - DIAGONAL_ANGLE);
                            grid.setUsed(x, y);
                        } else if (pathSet.backDiagonalDownEndsAt(x + 0.25, y + 0.25)) {
                            decorationSet.insert(x + 0.25, y + 0.25, '>', 90 - DIAGONAL_ANGLE);
                            grid.setUsed(x, y);
                        } else if (pathSet.verticalPassesThrough(x, y)) {
                            // Only try this if all others failed
                            decorationSet.insert(x, y + 0.5, '>', 90);
                            grid.setUsed(x, y);
                        }
                    }
                    // arrow heads
                }
                // decoration type
            }
            // y
        }
        // x
    }
    // findArrowHeads

    // Cases where we want to redraw at graphical unicode character
    // to adjust its weight or shape for a conventional application
    // in constructing a diagram.
    function findReplacementCharacters(grid, pathSet) {
        for (var x = 0; x < grid.width; ++x) {
            for (var y = 0; y < grid.height; ++y) {
                if (grid.isUsed(x, y))
                    continue;
                var c = grid(x, y);
                switch (c) {
                case '╱':
                    pathSet.insert(new Path(Vec2(x - 0.5, y + 0.5),Vec2(x + 0.5, y - 0.5)));
                    grid.setUsed(x, y);
                    break;
                case '╲':
                    pathSet.insert(new Path(Vec2(x - 0.5, y - 0.5),Vec2(x + 0.5, y + 0.5)));
                    grid.setUsed(x, y);
                    break;
                }
            }
        }
    }
    // findReplacementCharacters

    var grid = makeGrid(diagramString);

    var pathSet = new PathSet();
    var decorationSet = new DecorationSet();

    findPaths(grid, pathSet);
    findReplacementCharacters(grid, pathSet);
    findDecorations(grid, pathSet, decorationSet);

    var svg = '<svg class="diagram" xmlns="http://www.w3.org/2000/svg" version="1.1" height="' + ((grid.height + 1) * SCALE * ASPECT) + '" width="' + ((grid.width + 1) * SCALE) + '"';

    if (alignmentHint === 'floatleft') {
        svg += ' style="float:left;margin:15px 30px 15px 0;"';
    } else if (alignmentHint === 'floatright') {
        svg += ' style="float:right;margin:15px 0 15px 30px;"';
    } else if (alignmentHint === 'center') {
        svg += ' style="margin:0 auto 0 auto;"';
    }

    svg += '><g transform="translate(' + Vec2(1, 1) + ')">\n';

    if (DEBUG_SHOW_GRID) {
        svg += '<g style="opacity:0.1">\n';
        for (var x = 0; x < grid.width; ++x) {
            for (var y = 0; y < grid.height; ++y) {
                svg += '<rect x="' + ((x - 0.5) * SCALE + 1) + '" + y="' + ((y - 0.5) * SCALE * ASPECT + 2) + '" width="' + (SCALE - 2) + '" height="' + (SCALE * ASPECT - 2) + '" style="fill:';
                if (grid.isUsed(x, y)) {
                    svg += 'red;';
                } else if (grid(x, y) === ' ') {
                    svg += 'gray;opacity:0.05';
                } else {
                    svg += 'blue;';
                }
                svg += '"/>\n';
            }
        }
        svg += '</g>\n';
    }

    svg += pathSet.toSVG();
    svg += decorationSet.toSVG();

    // Convert any remaining characters
    if (!DEBUG_HIDE_PASSTHROUGH) {
        svg += '<g transform="translate(0,0)">';
        for (var y = 0; y < grid.height; ++y) {
            for (var x = 0; x < grid.width; ++x) {
                var c = grid(x, y);
                if (/[\u2B22\u2B21]/.test(c)) {
                    // Enlarge hexagons so that they fill a grid
                    svg += '<text text-anchor="middle" x="' + (x * SCALE) + '" y="' + (4 + y * SCALE * ASPECT) + '" style="font-size:20.5px">' + escapeHTMLEntities(c) + '</text>';
                } else if ((c !== ' ') && !grid.isUsed(x, y)) {
                    svg += '<text text-anchor="middle" x="' + (x * SCALE) + '" y="' + (4 + y * SCALE * ASPECT) + '">' + escapeHTMLEntities(c) + '</text>';
                }
                // if
            }
            // y
        }
        // x
        svg += '</g>';
    }

    if (DEBUG_SHOW_SOURCE) {
        // Offset the characters a little for easier viewing
        svg += '<g transform="translate(2,2)">\n';
        for (var x = 0; x < grid.width; ++x) {
            for (var y = 0; y < grid.height; ++y) {
                var c = grid(x, y);
                if (c !== ' ') {
                    svg += '<text text-anchor="middle" x="' + (x * SCALE) + '" y="' + (4 + y * SCALE * ASPECT) + '" style="fill:#F00;font-family:Menlo,monospace;font-size:12px;text-align:center">' + escapeHTMLEntities(c) + '</text>';
                }
                // if
            }
            // y
        }
        // x
        svg += '</g>';
    }
    // if

    svg += '</g></svg>';

    svg = svg.replace(new RegExp(HIDE_O,'g'), 'o');

    return svg;
}


module.exports = function replaceDiagrams(str) {
    var result = extractDiagram(str);
    if (result.diagramString) {
        var CAPTION_REGEXP = /^\n*[ \t]*\[[^\n]+\][ \t]*(?=\n)/;
        result.afterString = result.afterString.replace(CAPTION_REGEXP, function(caption) {
            // Strip whitespace and enclosing brackets from the caption
            caption = caption.trim();
            caption = caption.substring(1, caption.length - 1);

            result.caption = entag('center', entag('div', caption, protect('class="imagecaption"')));
            return '';
        });

        var diagramSVG = diagramToSVG(result.diagramString, result.alignmentHint);
        var captionAbove = true; // option('captionAbove', 'diagram')

        return result.beforeString + (result.caption && captionAbove ? result.caption : '') + diagramSVG + (result.caption && !captionAbove ? result.caption : '') + '\n' + replaceDiagrams(result.afterString);
    } else {
        return str;
    }
}