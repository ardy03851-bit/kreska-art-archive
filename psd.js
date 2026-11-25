(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.agPsd = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readAbr = void 0;
var descriptor_1 = require("./descriptor");
var psdReader_1 = require("./psdReader");
var dynamicsControl = ['off', 'fade', 'pen pressure', 'pen tilt', 'stylus wheel', 'initial direction', 'direction', 'initial rotation', 'rotation'];
var toBrushType = {
    _: 'brush',
    MixB: 'mixer brush',
    SmTl: 'smudge brush',
    // PbTl
    // ErTl
};
function parseDynamics(desc) {
    return {
        control: dynamicsControl[desc.bVTy],
        steps: desc.fStp,
        jitter: (0, descriptor_1.parsePercent)(desc.jitter),
        minimum: (0, descriptor_1.parsePercent)(desc['Mnm ']),
    };
}
function parseBrushShape(desc) {
    var shape = {
        size: (0, descriptor_1.parseUnitsToNumber)(desc.Dmtr, 'Pixels'),
        angle: (0, descriptor_1.parseAngle)(desc.Angl),
        roundness: (0, descriptor_1.parsePercent)(desc.Rndn),
        spacingOn: desc.Intr,
        spacing: (0, descriptor_1.parsePercent)(desc.Spcn),
        flipX: desc.flipX,
        flipY: desc.flipY,
    };
    if (desc['Nm  '])
        shape.name = desc['Nm  '];
    if (desc.Hrdn)
        shape.hardness = (0, descriptor_1.parsePercent)(desc.Hrdn);
    if (desc.sampledData)
        shape.sampledData = desc.sampledData;
    return shape;
}
function readAbr(buffer, options) {
    var _a, _b, _c, _d;
    if (options === void 0) { options = {}; }
    var reader = (0, psdReader_1.createReader)(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    var version = (0, psdReader_1.readInt16)(reader);
    var samples = [];
    var brushes = [];
    var patterns = [];
    if (version === 1 || version === 2) {
        throw new Error("Unsupported ABR version (".concat(version, ")")); // TODO: ...
    }
    else if (version === 6 || version === 7 || version === 9 || version === 10) {
        var minorVersion = (0, psdReader_1.readInt16)(reader);
        if (minorVersion !== 1 && minorVersion !== 2)
            throw new Error('Unsupported ABR minor version');
        while (reader.offset < reader.view.byteLength) {
            (0, psdReader_1.checkSignature)(reader, '8BIM');
            var type = (0, psdReader_1.readSignature)(reader);
            var size = (0, psdReader_1.readUint32)(reader);
            var end = reader.offset + size;
            switch (type) {
                case 'samp': {
                    while (reader.offset < end) {
                        var brushLength = (0, psdReader_1.readUint32)(reader);
                        while (brushLength & 3)
                            brushLength++; // pad to 4 byte alignment
                        var brushEnd = reader.offset + brushLength;
                        var id = (0, psdReader_1.readPascalString)(reader, 1);
                        // v1 - Skip the Int16 bounds rectangle and the unknown Int16.
                        // v2 - Skip the unknown bytes.
                        (0, psdReader_1.skipBytes)(reader, minorVersion === 1 ? 10 : 264);
                        var y = (0, psdReader_1.readInt32)(reader);
                        var x = (0, psdReader_1.readInt32)(reader);
                        var h = (0, psdReader_1.readInt32)(reader) - y;
                        var w = (0, psdReader_1.readInt32)(reader) - x;
                        if (w <= 0 || h <= 0)
                            throw new Error('Invalid bounds');
                        var bithDepth = (0, psdReader_1.readInt16)(reader);
                        var compression = (0, psdReader_1.readUint8)(reader); // 0 - raw, 1 - RLE
                        var alpha = new Uint8Array(w * h);
                        if (bithDepth === 8) {
                            if (compression === 0) {
                                alpha.set((0, psdReader_1.readBytes)(reader, alpha.byteLength));
                            }
                            else if (compression === 1) {
                                (0, psdReader_1.readDataRLE)(reader, { width: w, height: h, data: alpha }, w, h, bithDepth, 1, [0], false);
                            }
                            else {
                                throw new Error('Invalid compression');
                            }
                        }
                        else if (bithDepth === 16) {
                            if (compression === 0) {
                                for (var i = 0; i < alpha.byteLength; i++) {
                                    alpha[i] = (0, psdReader_1.readUint16)(reader) >> 8; // convert to 8bit values
                                }
                            }
                            else if (compression === 1) {
                                throw new Error('not implemented (16bit RLE)'); // TODO: ...
                            }
                            else {
                                throw new Error('Invalid compression');
                            }
                        }
                        else {
                            throw new Error('Invalid depth');
                        }
                        samples.push({ id: id, bounds: { x: x, y: y, w: w, h: h }, alpha: alpha });
                        reader.offset = brushEnd;
                    }
                    break;
                }
                case 'desc': {
                    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader, true);
                    // console.log(require('util').inspect(desc, false, 99, true));
                    for (var _i = 0, _e = desc.Brsh; _i < _e.length; _i++) {
                        var brush = _e[_i];
                        var b = {
                            name: brush['Nm  '],
                            shape: parseBrushShape(brush.Brsh),
                            spacing: (0, descriptor_1.parsePercent)(brush.Spcn),
                            // TODO: brushGroup ???
                            wetEdges: brush.Wtdg,
                            noise: brush.Nose,
                            // TODO: TxtC ??? smoothing / build-up ?
                            // TODO: 'Rpt ' ???
                            useBrushSize: brush.useBrushSize, // ???
                        };
                        if (brush.interpretation != null)
                            b.interpretation = brush.interpretation;
                        if (brush.protectTexture != null)
                            b.protectTexture = brush.protectTexture;
                        if (brush.useTipDynamics) {
                            b.shapeDynamics = {
                                tiltScale: (0, descriptor_1.parsePercent)(brush.tiltScale),
                                sizeDynamics: parseDynamics(brush.szVr),
                                angleDynamics: parseDynamics(brush.angleDynamics),
                                roundnessDynamics: parseDynamics(brush.roundnessDynamics),
                                flipX: brush.flipX,
                                flipY: brush.flipY,
                                brushProjection: brush.brushProjection,
                                minimumDiameter: (0, descriptor_1.parsePercent)(brush.minimumDiameter),
                                minimumRoundness: (0, descriptor_1.parsePercent)(brush.minimumRoundness),
                            };
                        }
                        if (brush.useScatter) {
                            b.scatter = {
                                count: brush['Cnt '],
                                bothAxes: brush.bothAxes,
                                countDynamics: parseDynamics(brush.countDynamics),
                                scatterDynamics: parseDynamics(brush.scatterDynamics),
                            };
                        }
                        if (brush.useTexture && brush.Txtr) {
                            b.texture = {
                                id: brush.Txtr.Idnt,
                                name: brush.Txtr['Nm  '],
                                blendMode: descriptor_1.BlnM.decode(brush.textureBlendMode),
                                depth: (0, descriptor_1.parsePercent)(brush.textureDepth),
                                depthMinimum: (0, descriptor_1.parsePercent)(brush.minimumDepth),
                                depthDynamics: parseDynamics(brush.textureDepthDynamics),
                                scale: (0, descriptor_1.parsePercent)(brush.textureScale),
                                invert: brush.InvT,
                                brightness: brush.textureBrightness,
                                contrast: brush.textureContrast,
                            };
                        }
                        var db = brush.dualBrush;
                        if (db && db.useDualBrush) {
                            b.dualBrush = {
                                flip: db.Flip,
                                shape: parseBrushShape(db.Brsh),
                                blendMode: descriptor_1.BlnM.decode(db.BlnM),
                                useScatter: db.useScatter,
                                spacing: (0, descriptor_1.parsePercent)(db.Spcn),
                                count: db['Cnt '],
                                bothAxes: db.bothAxes,
                                countDynamics: parseDynamics(db.countDynamics),
                                scatterDynamics: parseDynamics(db.scatterDynamics),
                            };
                        }
                        if (brush.useColorDynamics) {
                            b.colorDynamics = {
                                foregroundBackground: parseDynamics(brush.clVr),
                                hue: (0, descriptor_1.parsePercent)(brush['H   ']),
                                saturation: (0, descriptor_1.parsePercent)(brush.Strt),
                                brightness: (0, descriptor_1.parsePercent)(brush.Brgh),
                                purity: (0, descriptor_1.parsePercent)(brush.purity),
                                perTip: brush.colorDynamicsPerTip,
                            };
                        }
                        if (brush.usePaintDynamics) {
                            b.transfer = {
                                flowDynamics: parseDynamics(brush.prVr),
                                opacityDynamics: parseDynamics(brush.opVr),
                                wetnessDynamics: parseDynamics(brush.wtVr),
                                mixDynamics: parseDynamics(brush.mxVr),
                            };
                        }
                        if (brush.useBrushPose) {
                            b.brushPose = {
                                overrideAngle: brush.overridePoseAngle,
                                overrideTiltX: brush.overridePoseTiltX,
                                overrideTiltY: brush.overridePoseTiltY,
                                overridePressure: brush.overridePosePressure,
                                pressure: (0, descriptor_1.parsePercent)(brush.brushPosePressure),
                                tiltX: brush.brushPoseTiltX,
                                tiltY: brush.brushPoseTiltY,
                                angle: brush.brushPoseAngle,
                            };
                        }
                        var to = brush.toolOptions;
                        if (to) {
                            b.toolOptions = {
                                type: toBrushType[to._classID] || 'brush',
                                brushPreset: to.brushPreset,
                                flow: (_a = to.flow) !== null && _a !== void 0 ? _a : 100,
                                smooth: (_b = to.Smoo) !== null && _b !== void 0 ? _b : 0,
                                mode: descriptor_1.BlnM.decode(to['Md  '] || 'BlnM.Nrml'),
                                opacity: (_c = to.Opct) !== null && _c !== void 0 ? _c : 100,
                                smoothing: !!to.smoothing,
                                smoothingValue: to.smoothingValue || 0,
                                smoothingRadiusMode: !!to.smoothingRadiusMode,
                                smoothingCatchup: !!to.smoothingCatchup,
                                smoothingCatchupAtEnd: !!to.smoothingCatchupAtEnd,
                                smoothingZoomCompensation: !!to.smoothingZoomCompensation,
                                pressureSmoothing: !!to.pressureSmoothing,
                                usePressureOverridesSize: !!to.usePressureOverridesSize,
                                usePressureOverridesOpacity: !!to.usePressureOverridesOpacity,
                                useLegacy: !!to.useLegacy,
                            };
                            if (to.prVr)
                                b.toolOptions.flowDynamics = parseDynamics(to.prVr);
                            if (to.opVr)
                                b.toolOptions.opacityDynamics = parseDynamics(to.opVr);
                            if (to.szVr)
                                b.toolOptions.sizeDynamics = parseDynamics(to.szVr);
                            if ('wetness' in to)
                                b.toolOptions.wetness = to.wetness;
                            if ('dryness' in to)
                                b.toolOptions.dryness = to.dryness;
                            if ('mix' in to)
                                b.toolOptions.mix = to.mix;
                            if ('autoFill' in to)
                                b.toolOptions.autoFill = to.autoFill;
                            if ('autoClean' in to)
                                b.toolOptions.autoClean = to.autoClean;
                            if ('loadSolidColorOnly' in to)
                                b.toolOptions.loadSolidColorOnly = to.loadSolidColorOnly;
                            if ('sampleAllLayers' in to)
                                b.toolOptions.sampleAllLayers = to.sampleAllLayers;
                            if ('SmdF' in to)
                                b.toolOptions.smudgeFingerPainting = to.SmdF;
                            if ('SmdS' in to)
                                b.toolOptions.smudgeSampleAllLayers = to.SmdS;
                            if ('Prs ' in to)
                                b.toolOptions.strength = to['Prs '];
                            if ('SmdF' in to)
                                b.toolOptions.smudgeFingerPainting = to.SmdF;
                            if ('SmdS' in to)
                                b.toolOptions.smudgeSampleAllLayers = to.SmdS;
                        }
                        brushes.push(b);
                    }
                    break;
                }
                case 'patt': {
                    if (reader.offset < end) { // TODO: check multiple patterns
                        patterns.push((0, psdReader_1.readPattern)(reader));
                        reader.offset = end;
                    }
                    break;
                }
                case 'phry': {
                    // TODO: what is this ?
                    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
                    if (options.logMissingFeatures) {
                        if ((_d = desc.hierarchy) === null || _d === void 0 ? void 0 : _d.length) {
                            console.log('unhandled phry section', desc);
                        }
                    }
                    break;
                }
                default:
                    throw new Error("Invalid brush type: ".concat(type));
            }
            // align to 4 bytes
            while (size % 4) {
                reader.offset++;
                size++;
            }
        }
    }
    else {
        throw new Error("Unsupported ABR version (".concat(version, ")"));
    }
    return { samples: samples, patterns: patterns, brushes: brushes };
}
exports.readAbr = readAbr;

},{"./descriptor":4,"./psdReader":11}],2:[function(require,module,exports){
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasMultiEffects = exports.readVectorMask = exports.booleanOperations = exports.readBezierKnot = exports.infoHandlersMap = exports.infoHandlers = void 0;
var base64_js_1 = require("base64-js");
var effectsHelpers_1 = require("./effectsHelpers");
var helpers_1 = require("./helpers");
var psdReader_1 = require("./psdReader");
var psdWriter_1 = require("./psdWriter");
var descriptor_1 = require("./descriptor");
var engineData_1 = require("./engineData");
var text_1 = require("./text");
var fromAtoZ = 'abcdefghijklmnopqrstuvwxyz';
exports.infoHandlers = [];
exports.infoHandlersMap = {};
function addHandler(key, has, read, write) {
    var handler = { key: key, has: has, read: read, write: write };
    exports.infoHandlers.push(handler);
    exports.infoHandlersMap[handler.key] = handler;
}
function addHandlerAlias(key, target) {
    exports.infoHandlersMap[key] = exports.infoHandlersMap[target];
}
function hasKey(key) {
    return function (target) { return target[key] !== undefined; };
}
function readLength64(reader) {
    if ((0, psdReader_1.readUint32)(reader))
        throw new Error("Resource size above 4 GB limit at ".concat(reader.offset.toString(16)));
    return (0, psdReader_1.readUint32)(reader);
}
function writeLength64(writer, length) {
    (0, psdWriter_1.writeUint32)(writer, 0);
    (0, psdWriter_1.writeUint32)(writer, length);
}
addHandler('TySh', hasKey('text'), function (reader, target, leftBytes) {
    if ((0, psdReader_1.readInt16)(reader) !== 1)
        throw new Error("Invalid TySh version");
    var transform = [];
    for (var i = 0; i < 6; i++)
        transform.push((0, psdReader_1.readFloat64)(reader));
    if ((0, psdReader_1.readInt16)(reader) !== 50)
        throw new Error("Invalid TySh text version");
    var text = (0, descriptor_1.readVersionAndDescriptor)(reader);
    // console.log(require('util').inspect(text, false, 99, false), 'utf8');
    if ((0, psdReader_1.readInt16)(reader) !== 1)
        throw new Error("Invalid TySh warp version");
    var warp = (0, descriptor_1.readVersionAndDescriptor)(reader);
    // console.log(require('util').inspect(warp, false, 99, false), 'utf8');
    target.text = {
        transform: transform,
        left: (0, psdReader_1.readFloat32)(reader),
        top: (0, psdReader_1.readFloat32)(reader),
        right: (0, psdReader_1.readFloat32)(reader),
        bottom: (0, psdReader_1.readFloat32)(reader),
        text: text['Txt '].replace(/\r/g, '\n'),
        index: text.TextIndex || 0,
        gridding: descriptor_1.textGridding.decode(text.textGridding),
        antiAlias: descriptor_1.Annt.decode(text.AntA),
        orientation: descriptor_1.Ornt.decode(text.Ornt),
        warp: {
            style: descriptor_1.warpStyle.decode(warp.warpStyle),
            value: warp.warpValue || 0,
            perspective: warp.warpPerspective || 0,
            perspectiveOther: warp.warpPerspectiveOther || 0,
            rotate: descriptor_1.Ornt.decode(warp.warpRotate),
        },
    };
    if (text.bounds)
        target.text.bounds = (0, descriptor_1.descBoundsToBounds)(text.bounds);
    if (text.boundingBox)
        target.text.boundingBox = (0, descriptor_1.descBoundsToBounds)(text.boundingBox);
    if (text.EngineData) {
        var engineData = (0, engineData_1.parseEngineData)(text.EngineData);
        var textData = (0, text_1.decodeEngineData)(engineData);
        // console.log(require('util').inspect(engineData, false, 99, false), 'utf8');
        // require('fs').writeFileSync(`layer-${target.name}.txt`, require('util').inspect(engineData, false, 99, false), 'utf8');
        // const before = parseEngineData(text.EngineData);
        // const after = encodeEngineData(engineData);
        // require('fs').writeFileSync('before.txt', require('util').inspect(before, false, 99, false), 'utf8');
        // require('fs').writeFileSync('after.txt', require('util').inspect(after, false, 99, false), 'utf8');
        // console.log(require('util').inspect(parseEngineData(text.EngineData), false, 99, true));
        target.text = __assign(__assign({}, target.text), textData);
        // console.log(require('util').inspect(target.text, false, 99, true));
    }
    (0, psdReader_1.skipBytes)(reader, leftBytes());
}, function (writer, target) {
    var text = target.text;
    var warp = text.warp || {};
    var transform = text.transform || [1, 0, 0, 1, 0, 0];
    var textDescriptor = __assign(__assign(__assign({ 'Txt ': (text.text || '').replace(/\r?\n/g, '\r'), textGridding: descriptor_1.textGridding.encode(text.gridding), Ornt: descriptor_1.Ornt.encode(text.orientation), AntA: descriptor_1.Annt.encode(text.antiAlias) }, (text.bounds ? { bounds: (0, descriptor_1.boundsToDescBounds)(text.bounds) } : {})), (text.boundingBox ? { boundingBox: (0, descriptor_1.boundsToDescBounds)(text.boundingBox) } : {})), { TextIndex: text.index || 0, EngineData: (0, engineData_1.serializeEngineData)((0, text_1.encodeEngineData)(text)) });
    (0, psdWriter_1.writeInt16)(writer, 1); // version
    for (var i = 0; i < 6; i++) {
        (0, psdWriter_1.writeFloat64)(writer, transform[i]);
    }
    (0, psdWriter_1.writeInt16)(writer, 50); // text version
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'TxLr', textDescriptor, 'text');
    (0, psdWriter_1.writeInt16)(writer, 1); // warp version
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'warp', encodeWarp(warp));
    (0, psdWriter_1.writeFloat32)(writer, text.left);
    (0, psdWriter_1.writeFloat32)(writer, text.top);
    (0, psdWriter_1.writeFloat32)(writer, text.right);
    (0, psdWriter_1.writeFloat32)(writer, text.bottom);
    // writeZeros(writer, 2);
});
// vector fills
addHandler('SoCo', function (target) { return target.vectorFill !== undefined && target.vectorStroke === undefined &&
    target.vectorFill.type === 'color'; }, function (reader, target) {
    var descriptor = (0, descriptor_1.readVersionAndDescriptor)(reader);
    target.vectorFill = (0, descriptor_1.parseVectorContent)(descriptor);
}, function (writer, target) {
    var descriptor = (0, descriptor_1.serializeVectorContent)(target.vectorFill).descriptor;
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', descriptor);
});
addHandler('GdFl', function (target) { return target.vectorFill !== undefined && target.vectorStroke === undefined &&
    (target.vectorFill.type === 'solid' || target.vectorFill.type === 'noise'); }, function (reader, target, left) {
    var descriptor = (0, descriptor_1.readVersionAndDescriptor)(reader);
    target.vectorFill = (0, descriptor_1.parseVectorContent)(descriptor);
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var descriptor = (0, descriptor_1.serializeVectorContent)(target.vectorFill).descriptor;
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', descriptor);
});
addHandler('PtFl', function (target) { return target.vectorFill !== undefined && target.vectorStroke === undefined &&
    target.vectorFill.type === 'pattern'; }, function (reader, target) {
    var descriptor = (0, descriptor_1.readVersionAndDescriptor)(reader);
    target.vectorFill = (0, descriptor_1.parseVectorContent)(descriptor);
}, function (writer, target) {
    var descriptor = (0, descriptor_1.serializeVectorContent)(target.vectorFill).descriptor;
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', descriptor);
});
addHandler('vscg', function (target) { return target.vectorFill !== undefined && target.vectorStroke !== undefined; }, function (reader, target, left) {
    (0, psdReader_1.readSignature)(reader); // key
    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
    target.vectorFill = (0, descriptor_1.parseVectorContent)(desc);
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var _a = (0, descriptor_1.serializeVectorContent)(target.vectorFill), descriptor = _a.descriptor, key = _a.key;
    (0, psdWriter_1.writeSignature)(writer, key);
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', descriptor);
});
function readBezierKnot(reader, width, height) {
    var y0 = (0, psdReader_1.readFixedPointPath32)(reader) * height;
    var x0 = (0, psdReader_1.readFixedPointPath32)(reader) * width;
    var y1 = (0, psdReader_1.readFixedPointPath32)(reader) * height;
    var x1 = (0, psdReader_1.readFixedPointPath32)(reader) * width;
    var y2 = (0, psdReader_1.readFixedPointPath32)(reader) * height;
    var x2 = (0, psdReader_1.readFixedPointPath32)(reader) * width;
    return [x0, y0, x1, y1, x2, y2];
}
exports.readBezierKnot = readBezierKnot;
function writeBezierKnot(writer, points, width, height) {
    (0, psdWriter_1.writeFixedPointPath32)(writer, points[1] / height); // y0
    (0, psdWriter_1.writeFixedPointPath32)(writer, points[0] / width); // x0
    (0, psdWriter_1.writeFixedPointPath32)(writer, points[3] / height); // y1
    (0, psdWriter_1.writeFixedPointPath32)(writer, points[2] / width); // x1
    (0, psdWriter_1.writeFixedPointPath32)(writer, points[5] / height); // y2
    (0, psdWriter_1.writeFixedPointPath32)(writer, points[4] / width); // x2
}
exports.booleanOperations = ['exclude', 'combine', 'subtract', 'intersect'];
function readVectorMask(reader, vectorMask, width, height, size) {
    var end = reader.offset + size;
    var paths = vectorMask.paths;
    var path = undefined;
    while ((end - reader.offset) >= 26) {
        var selector = (0, psdReader_1.readUint16)(reader);
        switch (selector) {
            case 0: // Closed subpath length record
            case 3: { // Open subpath length record
                (0, psdReader_1.readUint16)(reader); // count
                var boolOp = (0, psdReader_1.readInt16)(reader);
                var flags = (0, psdReader_1.readUint16)(reader); // bit 1 always 1 ?
                (0, psdReader_1.skipBytes)(reader, 18);
                // TODO: 'combine' here might be wrong
                path = {
                    open: selector === 3,
                    operation: boolOp === -1 ? 'combine' : exports.booleanOperations[boolOp],
                    knots: [],
                    fillRule: flags === 2 ? 'non-zero' : 'even-odd',
                };
                paths.push(path);
                break;
            }
            case 1: // Closed subpath Bezier knot, linked
            case 2: // Closed subpath Bezier knot, unlinked
            case 4: // Open subpath Bezier knot, linked
            case 5: // Open subpath Bezier knot, unlinked
                path.knots.push({ linked: (selector === 1 || selector === 4), points: readBezierKnot(reader, width, height) });
                break;
            case 6: // Path fill rule record
                (0, psdReader_1.skipBytes)(reader, 24);
                break;
            case 7: { // Clipboard record
                // TODO: check if these need to be multiplied by document size
                var top_1 = (0, psdReader_1.readFixedPointPath32)(reader);
                var left = (0, psdReader_1.readFixedPointPath32)(reader);
                var bottom = (0, psdReader_1.readFixedPointPath32)(reader);
                var right = (0, psdReader_1.readFixedPointPath32)(reader);
                var resolution = (0, psdReader_1.readFixedPointPath32)(reader);
                (0, psdReader_1.skipBytes)(reader, 4);
                vectorMask.clipboard = { top: top_1, left: left, bottom: bottom, right: right, resolution: resolution };
                break;
            }
            case 8: // Initial fill rule record
                vectorMask.fillStartsWithAllPixels = !!(0, psdReader_1.readUint16)(reader);
                (0, psdReader_1.skipBytes)(reader, 22);
                break;
            default: throw new Error('Invalid vmsk section');
        }
    }
    return paths;
}
exports.readVectorMask = readVectorMask;
addHandler('vmsk', hasKey('vectorMask'), function (reader, target, left, _a) {
    var width = _a.width, height = _a.height;
    if ((0, psdReader_1.readUint32)(reader) !== 3)
        throw new Error('Invalid vmsk version');
    target.vectorMask = { paths: [] };
    var vectorMask = target.vectorMask;
    var flags = (0, psdReader_1.readUint32)(reader);
    vectorMask.invert = (flags & 1) !== 0;
    vectorMask.notLink = (flags & 2) !== 0;
    vectorMask.disable = (flags & 4) !== 0;
    readVectorMask(reader, vectorMask, width, height, left());
    // drawBezierPaths(vectorMask.paths, width, height, 'out.png');
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target, _a) {
    var width = _a.width, height = _a.height;
    var vectorMask = target.vectorMask;
    var flags = (vectorMask.invert ? 1 : 0) |
        (vectorMask.notLink ? 2 : 0) |
        (vectorMask.disable ? 4 : 0);
    (0, psdWriter_1.writeUint32)(writer, 3); // version
    (0, psdWriter_1.writeUint32)(writer, flags);
    // initial entry
    (0, psdWriter_1.writeUint16)(writer, 6);
    (0, psdWriter_1.writeZeros)(writer, 24);
    var clipboard = vectorMask.clipboard;
    if (clipboard) {
        (0, psdWriter_1.writeUint16)(writer, 7);
        (0, psdWriter_1.writeFixedPointPath32)(writer, clipboard.top);
        (0, psdWriter_1.writeFixedPointPath32)(writer, clipboard.left);
        (0, psdWriter_1.writeFixedPointPath32)(writer, clipboard.bottom);
        (0, psdWriter_1.writeFixedPointPath32)(writer, clipboard.right);
        (0, psdWriter_1.writeFixedPointPath32)(writer, clipboard.resolution);
        (0, psdWriter_1.writeZeros)(writer, 4);
    }
    if (vectorMask.fillStartsWithAllPixels !== undefined) {
        (0, psdWriter_1.writeUint16)(writer, 8);
        (0, psdWriter_1.writeUint16)(writer, vectorMask.fillStartsWithAllPixels ? 1 : 0);
        (0, psdWriter_1.writeZeros)(writer, 22);
    }
    for (var _i = 0, _b = vectorMask.paths; _i < _b.length; _i++) {
        var path = _b[_i];
        (0, psdWriter_1.writeUint16)(writer, path.open ? 3 : 0);
        (0, psdWriter_1.writeUint16)(writer, path.knots.length);
        (0, psdWriter_1.writeUint16)(writer, Math.abs(exports.booleanOperations.indexOf(path.operation))); // default to 1 if not found
        (0, psdWriter_1.writeUint16)(writer, path.fillRule === 'non-zero' ? 2 : 1);
        (0, psdWriter_1.writeZeros)(writer, 18); // TODO: these are sometimes non-zero
        var linkedKnot = path.open ? 4 : 1;
        var unlinkedKnot = path.open ? 5 : 2;
        for (var _c = 0, _d = path.knots; _c < _d.length; _c++) {
            var _e = _d[_c], linked = _e.linked, points = _e.points;
            (0, psdWriter_1.writeUint16)(writer, linked ? linkedKnot : unlinkedKnot);
            writeBezierKnot(writer, points, width, height);
        }
    }
});
// TODO: need to write vmsk if has outline ?
addHandlerAlias('vsms', 'vmsk');
addHandler('vogk', hasKey('vectorOrigination'), function (reader, target, left) {
    if ((0, psdReader_1.readInt32)(reader) !== 1)
        throw new Error("Invalid vogk version");
    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
    // console.log(require('util').inspect(desc, false, 99, true));
    target.vectorOrigination = { keyDescriptorList: [] };
    for (var _i = 0, _a = desc.keyDescriptorList; _i < _a.length; _i++) {
        var i = _a[_i];
        var item = {};
        if (i.keyShapeInvalidated != null)
            item.keyShapeInvalidated = i.keyShapeInvalidated;
        if (i.keyOriginType != null)
            item.keyOriginType = i.keyOriginType;
        if (i.keyOriginResolution != null)
            item.keyOriginResolution = i.keyOriginResolution;
        if (i.keyOriginShapeBBox) {
            item.keyOriginShapeBoundingBox = {
                top: (0, descriptor_1.parseUnits)(i.keyOriginShapeBBox['Top ']),
                left: (0, descriptor_1.parseUnits)(i.keyOriginShapeBBox.Left),
                bottom: (0, descriptor_1.parseUnits)(i.keyOriginShapeBBox.Btom),
                right: (0, descriptor_1.parseUnits)(i.keyOriginShapeBBox.Rght),
            };
        }
        var rectRadii = i.keyOriginRRectRadii;
        if (rectRadii) {
            item.keyOriginRRectRadii = {
                topRight: (0, descriptor_1.parseUnits)(rectRadii.topRight),
                topLeft: (0, descriptor_1.parseUnits)(rectRadii.topLeft),
                bottomLeft: (0, descriptor_1.parseUnits)(rectRadii.bottomLeft),
                bottomRight: (0, descriptor_1.parseUnits)(rectRadii.bottomRight),
            };
        }
        var corners = i.keyOriginBoxCorners;
        if (corners) {
            item.keyOriginBoxCorners = [
                { x: corners.rectangleCornerA.Hrzn, y: corners.rectangleCornerA.Vrtc },
                { x: corners.rectangleCornerB.Hrzn, y: corners.rectangleCornerB.Vrtc },
                { x: corners.rectangleCornerC.Hrzn, y: corners.rectangleCornerC.Vrtc },
                { x: corners.rectangleCornerD.Hrzn, y: corners.rectangleCornerD.Vrtc },
            ];
        }
        var trnf = i.Trnf;
        if (trnf) {
            item.transform = [trnf.xx, trnf.xy, trnf.xy, trnf.yy, trnf.tx, trnf.ty];
        }
        target.vectorOrigination.keyDescriptorList.push(item);
    }
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    target;
    var orig = target.vectorOrigination;
    var desc = { keyDescriptorList: [] };
    for (var i = 0; i < orig.keyDescriptorList.length; i++) {
        var item = orig.keyDescriptorList[i];
        if (item.keyShapeInvalidated) {
            desc.keyDescriptorList.push({ keyShapeInvalidated: true, keyOriginIndex: i });
        }
        else {
            desc.keyDescriptorList.push({}); // we're adding keyOriginIndex at the end
            var out = desc.keyDescriptorList[desc.keyDescriptorList.length - 1];
            if (item.keyOriginType != null)
                out.keyOriginType = item.keyOriginType;
            if (item.keyOriginResolution != null)
                out.keyOriginResolution = item.keyOriginResolution;
            var radii = item.keyOriginRRectRadii;
            if (radii) {
                out.keyOriginRRectRadii = {
                    unitValueQuadVersion: 1,
                    topRight: (0, descriptor_1.unitsValue)(radii.topRight, 'topRight'),
                    topLeft: (0, descriptor_1.unitsValue)(radii.topLeft, 'topLeft'),
                    bottomLeft: (0, descriptor_1.unitsValue)(radii.bottomLeft, 'bottomLeft'),
                    bottomRight: (0, descriptor_1.unitsValue)(radii.bottomRight, 'bottomRight'),
                };
            }
            var box = item.keyOriginShapeBoundingBox;
            if (box) {
                out.keyOriginShapeBBox = {
                    unitValueQuadVersion: 1,
                    'Top ': (0, descriptor_1.unitsValue)(box.top, 'top'),
                    Left: (0, descriptor_1.unitsValue)(box.left, 'left'),
                    Btom: (0, descriptor_1.unitsValue)(box.bottom, 'bottom'),
                    Rght: (0, descriptor_1.unitsValue)(box.right, 'right'),
                };
            }
            var corners = item.keyOriginBoxCorners;
            if (corners && corners.length === 4) {
                out.keyOriginBoxCorners = {
                    rectangleCornerA: { Hrzn: corners[0].x, Vrtc: corners[0].y },
                    rectangleCornerB: { Hrzn: corners[1].x, Vrtc: corners[1].y },
                    rectangleCornerC: { Hrzn: corners[2].x, Vrtc: corners[2].y },
                    rectangleCornerD: { Hrzn: corners[3].x, Vrtc: corners[3].y },
                };
            }
            var transform = item.transform;
            if (transform && transform.length === 6) {
                out.Trnf = {
                    xx: transform[0],
                    xy: transform[1],
                    yx: transform[2],
                    yy: transform[3],
                    tx: transform[4],
                    ty: transform[5],
                };
            }
            out.keyOriginIndex = i;
        }
    }
    (0, psdWriter_1.writeInt32)(writer, 1); // version
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc);
});
addHandler('lmfx', function (target) { return target.effects !== undefined && hasMultiEffects(target.effects); }, function (reader, target, left, _, options) {
    var version = (0, psdReader_1.readUint32)(reader);
    if (version !== 0)
        throw new Error('Invalid lmfx version');
    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
    // console.log(require('util').inspect(info, false, 99, true));
    // discard if read in 'lrFX' or 'lfx2' section
    target.effects = (0, descriptor_1.parseEffects)(desc, !!options.logMissingFeatures);
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target, _, options) {
    var desc = (0, descriptor_1.serializeEffects)(target.effects, !!options.logMissingFeatures, true);
    (0, psdWriter_1.writeUint32)(writer, 0); // version
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc);
});
addHandler('lrFX', hasKey('effects'), function (reader, target, left) {
    if (!target.effects)
        target.effects = (0, effectsHelpers_1.readEffects)(reader);
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    (0, effectsHelpers_1.writeEffects)(writer, target.effects);
});
addHandler('luni', hasKey('name'), function (reader, target, left) {
    target.name = (0, psdReader_1.readUnicodeString)(reader);
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    (0, psdWriter_1.writeUnicodeString)(writer, target.name);
    // writeUint16(writer, 0); // padding (but not extending string length)
});
addHandler('lnsr', hasKey('nameSource'), function (reader, target) { return target.nameSource = (0, psdReader_1.readSignature)(reader); }, function (writer, target) { return (0, psdWriter_1.writeSignature)(writer, target.nameSource); });
addHandler('lyid', hasKey('id'), function (reader, target) { return target.id = (0, psdReader_1.readUint32)(reader); }, function (writer, target, _psd, options) {
    var id = target.id;
    while (options.layerIds.has(id))
        id += 100; // make sure we don't have duplicate layer ids
    (0, psdWriter_1.writeUint32)(writer, id);
    options.layerIds.add(id);
    options.layerToId.set(target, id);
});
addHandler('lsct', hasKey('sectionDivider'), function (reader, target, left) {
    target.sectionDivider = { type: (0, psdReader_1.readUint32)(reader) };
    if (left()) {
        (0, psdReader_1.checkSignature)(reader, '8BIM');
        target.sectionDivider.key = (0, psdReader_1.readSignature)(reader);
    }
    if (left()) {
        target.sectionDivider.subType = (0, psdReader_1.readUint32)(reader);
    }
}, function (writer, target) {
    (0, psdWriter_1.writeUint32)(writer, target.sectionDivider.type);
    if (target.sectionDivider.key) {
        (0, psdWriter_1.writeSignature)(writer, '8BIM');
        (0, psdWriter_1.writeSignature)(writer, target.sectionDivider.key);
        if (target.sectionDivider.subType !== undefined) {
            (0, psdWriter_1.writeUint32)(writer, target.sectionDivider.subType);
        }
    }
});
// it seems lsdk is used when there's a layer is nested more than 6 levels, but I don't know why?
// maybe some limitation of old version of PS?
addHandlerAlias('lsdk', 'lsct');
addHandler('clbl', hasKey('blendClippendElements'), function (reader, target) {
    target.blendClippendElements = !!(0, psdReader_1.readUint8)(reader);
    (0, psdReader_1.skipBytes)(reader, 3);
}, function (writer, target) {
    (0, psdWriter_1.writeUint8)(writer, target.blendClippendElements ? 1 : 0);
    (0, psdWriter_1.writeZeros)(writer, 3);
});
addHandler('infx', hasKey('blendInteriorElements'), function (reader, target) {
    target.blendInteriorElements = !!(0, psdReader_1.readUint8)(reader);
    (0, psdReader_1.skipBytes)(reader, 3);
}, function (writer, target) {
    (0, psdWriter_1.writeUint8)(writer, target.blendInteriorElements ? 1 : 0);
    (0, psdWriter_1.writeZeros)(writer, 3);
});
addHandler('knko', hasKey('knockout'), function (reader, target) {
    target.knockout = !!(0, psdReader_1.readUint8)(reader);
    (0, psdReader_1.skipBytes)(reader, 3);
}, function (writer, target) {
    (0, psdWriter_1.writeUint8)(writer, target.knockout ? 1 : 0);
    (0, psdWriter_1.writeZeros)(writer, 3);
});
addHandler('lmgm', hasKey('layerMaskAsGlobalMask'), function (reader, target) {
    target.layerMaskAsGlobalMask = !!(0, psdReader_1.readUint8)(reader);
    (0, psdReader_1.skipBytes)(reader, 3);
}, function (writer, target) {
    (0, psdWriter_1.writeUint8)(writer, target.layerMaskAsGlobalMask ? 1 : 0);
    (0, psdWriter_1.writeZeros)(writer, 3);
});
addHandler('lspf', hasKey('protected'), function (reader, target) {
    var flags = (0, psdReader_1.readUint32)(reader);
    target.protected = {
        transparency: (flags & 0x01) !== 0,
        composite: (flags & 0x02) !== 0,
        position: (flags & 0x04) !== 0,
    };
    if (flags & 0x08)
        target.protected.artboards = true;
}, function (writer, target) {
    var flags = (target.protected.transparency ? 0x01 : 0) |
        (target.protected.composite ? 0x02 : 0) |
        (target.protected.position ? 0x04 : 0) |
        (target.protected.artboards ? 0x08 : 0);
    (0, psdWriter_1.writeUint32)(writer, flags);
});
addHandler('lclr', hasKey('layerColor'), function (reader, target) {
    var color = (0, psdReader_1.readUint16)(reader);
    (0, psdReader_1.skipBytes)(reader, 6);
    target.layerColor = helpers_1.layerColors[color];
}, function (writer, target) {
    var index = helpers_1.layerColors.indexOf(target.layerColor);
    (0, psdWriter_1.writeUint16)(writer, index === -1 ? 0 : index);
    (0, psdWriter_1.writeZeros)(writer, 6);
});
addHandler('shmd', function (target) { return target.timestamp !== undefined || target.animationFrames !== undefined ||
    target.animationFrameFlags !== undefined || target.timeline !== undefined || target.comps !== undefined; }, function (reader, target, left, _, options) {
    var count = (0, psdReader_1.readUint32)(reader);
    var _loop_1 = function (i) {
        (0, psdReader_1.checkSignature)(reader, '8BIM');
        var key = (0, psdReader_1.readSignature)(reader);
        (0, psdReader_1.readUint8)(reader); // copy
        (0, psdReader_1.skipBytes)(reader, 3);
        (0, psdReader_1.readSection)(reader, 1, function (left) {
            if (key === 'cust') {
                var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
                // console.log('cust', target.name, require('util').inspect(desc, false, 99, true));
                if (desc.layerTime !== undefined)
                    target.timestamp = desc.layerTime;
            }
            else if (key === 'mlst') {
                var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
                // console.log('mlst', target.name, require('util').inspect(desc, false, 99, true));
                target.animationFrames = [];
                for (var i_1 = 0; i_1 < desc.LaSt.length; i_1++) {
                    var f = desc.LaSt[i_1];
                    var frame = { frames: f.FrLs };
                    if (f.enab !== undefined)
                        frame.enable = f.enab;
                    if (f.Ofst)
                        frame.offset = (0, descriptor_1.horzVrtcToXY)(f.Ofst);
                    if (f.FXRf)
                        frame.referencePoint = (0, descriptor_1.horzVrtcToXY)(f.FXRf);
                    if (f.Lefx)
                        frame.effects = (0, descriptor_1.parseEffects)(f.Lefx, !!options.logMissingFeatures);
                    if (f.blendOptions && f.blendOptions.Opct)
                        frame.opacity = (0, descriptor_1.parsePercent)(f.blendOptions.Opct);
                    target.animationFrames.push(frame);
                }
            }
            else if (key === 'mdyn') {
                // frame flags
                (0, psdReader_1.readUint16)(reader); // unknown
                var propagate = (0, psdReader_1.readUint8)(reader);
                var flags = (0, psdReader_1.readUint8)(reader);
                target.animationFrameFlags = {
                    propagateFrameOne: !propagate,
                    unifyLayerPosition: (flags & 1) !== 0,
                    unifyLayerStyle: (flags & 2) !== 0,
                    unifyLayerVisibility: (flags & 4) !== 0,
                };
            }
            else if (key === 'tmln') {
                var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
                var timeScope = desc.timeScope;
                // console.log('tmln', target.name, target.id, require('util').inspect(desc, false, 99, true));
                var timeline = {
                    start: (0, descriptor_1.frac)(timeScope.Strt),
                    duration: (0, descriptor_1.frac)(timeScope.duration),
                    inTime: (0, descriptor_1.frac)(timeScope.inTime),
                    outTime: (0, descriptor_1.frac)(timeScope.outTime),
                    autoScope: desc.autoScope,
                    audioLevel: desc.audioLevel,
                };
                if (desc.trackList) {
                    timeline.tracks = (0, descriptor_1.parseTrackList)(desc.trackList, !!options.logMissingFeatures);
                }
                target.timeline = timeline;
                // console.log('tmln:result', target.name, target.id, require('util').inspect(timeline, false, 99, true));
            }
            else if (key === 'cmls') {
                var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
                // console.log('cmls', require('util').inspect(desc, false, 99, true));
                target.comps = {
                    settings: [],
                };
                if (desc.origFXRefPoint)
                    target.comps.originalEffectsReferencePoint = { x: desc.origFXRefPoint.Hrzn, y: desc.origFXRefPoint.Vrtc };
                for (var _i = 0, _a = desc.layerSettings; _i < _a.length; _i++) {
                    var item = _a[_i];
                    target.comps.settings.push({ compList: item.compList });
                    var t = target.comps.settings[target.comps.settings.length - 1];
                    if ('enab' in item)
                        t.enabled = item.enab;
                    if (item.Ofst)
                        t.offset = { x: item.Ofst.Hrzn, y: item.Ofst.Vrtc };
                    if (item.FXRefPoint)
                        t.effectsReferencePoint = { x: item.FXRefPoint.Hrzn, y: item.FXRefPoint.Vrtc };
                }
            }
            else {
                options.logMissingFeatures && console.log('Unhandled "shmd" section key', key);
            }
            (0, psdReader_1.skipBytes)(reader, left());
        });
    };
    for (var i = 0; i < count; i++) {
        _loop_1(i);
    }
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target, _, options) {
    var animationFrames = target.animationFrames, animationFrameFlags = target.animationFrameFlags, timestamp = target.timestamp, timeline = target.timeline, comps = target.comps;
    var count = 0;
    if (animationFrames)
        count++;
    if (animationFrameFlags)
        count++;
    if (timeline)
        count++;
    if (timestamp !== undefined)
        count++;
    if (comps)
        count++;
    (0, psdWriter_1.writeUint32)(writer, count);
    if (animationFrames) {
        (0, psdWriter_1.writeSignature)(writer, '8BIM');
        (0, psdWriter_1.writeSignature)(writer, 'mlst');
        (0, psdWriter_1.writeUint8)(writer, 0); // copy (always false)
        (0, psdWriter_1.writeZeros)(writer, 3);
        (0, psdWriter_1.writeSection)(writer, 2, function () {
            var _a;
            var desc = {
                LaID: (_a = target.id) !== null && _a !== void 0 ? _a : 0,
                LaSt: [],
            };
            for (var i = 0; i < animationFrames.length; i++) {
                var f = animationFrames[i];
                var frame = {};
                if (f.enable !== undefined)
                    frame.enab = f.enable;
                frame.FrLs = f.frames;
                if (f.offset)
                    frame.Ofst = (0, descriptor_1.xyToHorzVrtc)(f.offset);
                if (f.referencePoint)
                    frame.FXRf = (0, descriptor_1.xyToHorzVrtc)(f.referencePoint);
                if (f.effects)
                    frame.Lefx = (0, descriptor_1.serializeEffects)(f.effects, false, false);
                if (f.opacity !== undefined)
                    frame.blendOptions = { Opct: (0, descriptor_1.unitsPercent)(f.opacity) };
                desc.LaSt.push(frame);
            }
            (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc);
        }, true);
    }
    if (animationFrameFlags) {
        (0, psdWriter_1.writeSignature)(writer, '8BIM');
        (0, psdWriter_1.writeSignature)(writer, 'mdyn');
        (0, psdWriter_1.writeUint8)(writer, 0); // copy (always false)
        (0, psdWriter_1.writeZeros)(writer, 3);
        (0, psdWriter_1.writeSection)(writer, 2, function () {
            (0, psdWriter_1.writeUint16)(writer, 0); // unknown
            (0, psdWriter_1.writeUint8)(writer, animationFrameFlags.propagateFrameOne ? 0x0 : 0xf);
            (0, psdWriter_1.writeUint8)(writer, (animationFrameFlags.unifyLayerPosition ? 1 : 0) |
                (animationFrameFlags.unifyLayerStyle ? 2 : 0) |
                (animationFrameFlags.unifyLayerVisibility ? 4 : 0));
        });
    }
    if (timeline) {
        (0, psdWriter_1.writeSignature)(writer, '8BIM');
        (0, psdWriter_1.writeSignature)(writer, 'tmln');
        (0, psdWriter_1.writeUint8)(writer, 0); // copy (always false)
        (0, psdWriter_1.writeZeros)(writer, 3);
        (0, psdWriter_1.writeSection)(writer, 2, function () {
            var desc = {
                Vrsn: 1,
                timeScope: {
                    Vrsn: 1,
                    Strt: timeline.start,
                    duration: timeline.duration,
                    inTime: timeline.inTime,
                    outTime: timeline.outTime,
                },
                autoScope: timeline.autoScope,
                audioLevel: timeline.audioLevel,
            };
            if (timeline.tracks) {
                desc.trackList = (0, descriptor_1.serializeTrackList)(timeline.tracks);
            }
            var id = options.layerToId.get(target) || target.id;
            if (!id)
                throw new Error('You need to provide layer.id value whan writing document with animations');
            desc.LyrI = id;
            // console.log('WRITE:tmln', target.name, target.id, require('util').inspect(desc, false, 99, true));
            (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc, 'anim');
        }, true);
    }
    if (timestamp !== undefined) {
        (0, psdWriter_1.writeSignature)(writer, '8BIM');
        (0, psdWriter_1.writeSignature)(writer, 'cust');
        (0, psdWriter_1.writeUint8)(writer, 0); // copy (always false)
        (0, psdWriter_1.writeZeros)(writer, 3);
        (0, psdWriter_1.writeSection)(writer, 2, function () {
            var desc = {
                layerTime: timestamp,
            };
            (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'metadata', desc);
        }, true);
    }
    if (comps) {
        (0, psdWriter_1.writeSignature)(writer, '8BIM');
        (0, psdWriter_1.writeSignature)(writer, 'cmls');
        (0, psdWriter_1.writeUint8)(writer, 0); // copy (always false)
        (0, psdWriter_1.writeZeros)(writer, 3);
        (0, psdWriter_1.writeSection)(writer, 2, function () {
            var id = options.layerToId.get(target) || target.id;
            if (!id)
                throw new Error('You need to provide layer.id value whan writing document with layer comps');
            var desc = {};
            if (comps.originalEffectsReferencePoint) {
                desc.origFXRefPoint = { Hrzn: comps.originalEffectsReferencePoint.x, Vrtc: comps.originalEffectsReferencePoint.y };
            }
            desc.LyrI = id;
            desc.layerSettings = [];
            for (var _i = 0, _a = comps.settings; _i < _a.length; _i++) {
                var item = _a[_i];
                var t = {};
                if (item.enabled !== undefined)
                    t.enab = item.enabled;
                if (item.offset)
                    t.Ofst = { Hrzn: item.offset.x, Vrtc: item.offset.y };
                if (item.effectsReferencePoint)
                    t.FXRefPoint = { Hrzn: item.effectsReferencePoint.x, Vrtc: item.effectsReferencePoint.y };
                t.compList = item.compList;
                desc.layerSettings.push(t);
            }
            // console.log('cmls', require('util').inspect(desc, false, 99, true));
            (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc);
        }, true);
    }
});
addHandler('vstk', hasKey('vectorStroke'), function (reader, target, left) {
    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
    // console.log(require('util').inspect(desc, false, 99, true));
    target.vectorStroke = {
        strokeEnabled: desc.strokeEnabled,
        fillEnabled: desc.fillEnabled,
        lineWidth: (0, descriptor_1.parseUnits)(desc.strokeStyleLineWidth),
        lineDashOffset: (0, descriptor_1.parseUnits)(desc.strokeStyleLineDashOffset),
        miterLimit: desc.strokeStyleMiterLimit,
        lineCapType: descriptor_1.strokeStyleLineCapType.decode(desc.strokeStyleLineCapType),
        lineJoinType: descriptor_1.strokeStyleLineJoinType.decode(desc.strokeStyleLineJoinType),
        lineAlignment: descriptor_1.strokeStyleLineAlignment.decode(desc.strokeStyleLineAlignment),
        scaleLock: desc.strokeStyleScaleLock,
        strokeAdjust: desc.strokeStyleStrokeAdjust,
        lineDashSet: desc.strokeStyleLineDashSet.map(descriptor_1.parseUnits),
        blendMode: descriptor_1.BlnM.decode(desc.strokeStyleBlendMode),
        opacity: (0, descriptor_1.parsePercent)(desc.strokeStyleOpacity),
        content: (0, descriptor_1.parseVectorContent)(desc.strokeStyleContent),
        resolution: desc.strokeStyleResolution,
    };
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var _a, _b, _c;
    var stroke = target.vectorStroke;
    var desc = {
        strokeStyleVersion: 2,
        strokeEnabled: !!stroke.strokeEnabled,
        fillEnabled: !!stroke.fillEnabled,
        strokeStyleLineWidth: stroke.lineWidth || { value: 3, units: 'Points' },
        strokeStyleLineDashOffset: stroke.lineDashOffset || { value: 0, units: 'Points' },
        strokeStyleMiterLimit: (_a = stroke.miterLimit) !== null && _a !== void 0 ? _a : 100,
        strokeStyleLineCapType: descriptor_1.strokeStyleLineCapType.encode(stroke.lineCapType),
        strokeStyleLineJoinType: descriptor_1.strokeStyleLineJoinType.encode(stroke.lineJoinType),
        strokeStyleLineAlignment: descriptor_1.strokeStyleLineAlignment.encode(stroke.lineAlignment),
        strokeStyleScaleLock: !!stroke.scaleLock,
        strokeStyleStrokeAdjust: !!stroke.strokeAdjust,
        strokeStyleLineDashSet: stroke.lineDashSet || [],
        strokeStyleBlendMode: descriptor_1.BlnM.encode(stroke.blendMode),
        strokeStyleOpacity: (0, descriptor_1.unitsPercent)((_b = stroke.opacity) !== null && _b !== void 0 ? _b : 1),
        strokeStyleContent: (0, descriptor_1.serializeVectorContent)(stroke.content || { type: 'color', color: { r: 0, g: 0, b: 0 } }).descriptor,
        strokeStyleResolution: (_c = stroke.resolution) !== null && _c !== void 0 ? _c : 72,
    };
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'strokeStyle', desc);
});
addHandler('artb', // per-layer arboard info
hasKey('artboard'), function (reader, target, left) {
    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
    var rect = desc.artboardRect;
    target.artboard = {
        rect: { top: rect['Top '], left: rect.Left, bottom: rect.Btom, right: rect.Rght },
        guideIndices: desc.guideIndeces,
        presetName: desc.artboardPresetName,
        color: (0, descriptor_1.parseColor)(desc['Clr ']),
        backgroundType: desc.artboardBackgroundType,
    };
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var _a;
    var artboard = target.artboard;
    var rect = artboard.rect;
    var desc = {
        artboardRect: { 'Top ': rect.top, Left: rect.left, Btom: rect.bottom, Rght: rect.right },
        guideIndeces: artboard.guideIndices || [],
        artboardPresetName: artboard.presetName || '',
        'Clr ': (0, descriptor_1.serializeColor)(artboard.color),
        artboardBackgroundType: (_a = artboard.backgroundType) !== null && _a !== void 0 ? _a : 1,
    };
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'artboard', desc);
});
addHandler('sn2P', hasKey('usingAlignedRendering'), function (reader, target) { return target.usingAlignedRendering = !!(0, psdReader_1.readUint32)(reader); }, function (writer, target) { return (0, psdWriter_1.writeUint32)(writer, target.usingAlignedRendering ? 1 : 0); });
var placedLayerTypes = ['unknown', 'vector', 'raster', 'image stack'];
function parseWarp(warp) {
    var _a, _b, _c, _d, _e, _f;
    var result = __assign(__assign({ style: descriptor_1.warpStyle.decode(warp.warpStyle) }, (warp.warpValues ? { values: warp.warpValues } : { value: warp.warpValue || 0 })), { perspective: warp.warpPerspective || 0, perspectiveOther: warp.warpPerspectiveOther || 0, rotate: descriptor_1.Ornt.decode(warp.warpRotate), bounds: warp.bounds && {
            top: (0, descriptor_1.parseUnitsOrNumber)(warp.bounds['Top ']),
            left: (0, descriptor_1.parseUnitsOrNumber)(warp.bounds.Left),
            bottom: (0, descriptor_1.parseUnitsOrNumber)(warp.bounds.Btom),
            right: (0, descriptor_1.parseUnitsOrNumber)(warp.bounds.Rght),
        }, uOrder: warp.uOrder, vOrder: warp.vOrder });
    if (warp.deformNumRows != null || warp.deformNumCols != null) {
        result.deformNumRows = warp.deformNumRows;
        result.deformNumCols = warp.deformNumCols;
    }
    var envelopeWarp = warp.customEnvelopeWarp;
    if (envelopeWarp) {
        result.customEnvelopeWarp = {
            meshPoints: [],
        };
        var xs = ((_a = envelopeWarp.meshPoints.find(function (i) { return i.type === 'Hrzn'; })) === null || _a === void 0 ? void 0 : _a.values) || [];
        var ys = ((_b = envelopeWarp.meshPoints.find(function (i) { return i.type === 'Vrtc'; })) === null || _b === void 0 ? void 0 : _b.values) || [];
        for (var i = 0; i < xs.length; i++) {
            result.customEnvelopeWarp.meshPoints.push({ x: xs[i], y: ys[i] });
        }
        if (envelopeWarp.quiltSliceX || envelopeWarp.quiltSliceY) {
            result.customEnvelopeWarp.quiltSliceX = ((_d = (_c = envelopeWarp.quiltSliceX) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.values) || [];
            result.customEnvelopeWarp.quiltSliceY = ((_f = (_e = envelopeWarp.quiltSliceY) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.values) || [];
        }
    }
    return result;
}
function isQuiltWarp(warp) {
    var _a, _b;
    return warp.deformNumCols != null || warp.deformNumRows != null ||
        ((_a = warp.customEnvelopeWarp) === null || _a === void 0 ? void 0 : _a.quiltSliceX) || ((_b = warp.customEnvelopeWarp) === null || _b === void 0 ? void 0 : _b.quiltSliceY);
}
function encodeWarp(warp) {
    var bounds = warp.bounds;
    var desc = __assign(__assign({ warpStyle: descriptor_1.warpStyle.encode(warp.style) }, (warp.values ? { warpValues: warp.values } : { warpValue: warp.value || 0 })), { warpPerspective: warp.perspective || 0, warpPerspectiveOther: warp.perspectiveOther || 0, warpRotate: descriptor_1.Ornt.encode(warp.rotate), bounds: {
            'Top ': (0, descriptor_1.unitsValue)(bounds && bounds.top || { units: 'Pixels', value: 0 }, 'bounds.top'),
            Left: (0, descriptor_1.unitsValue)(bounds && bounds.left || { units: 'Pixels', value: 0 }, 'bounds.left'),
            Btom: (0, descriptor_1.unitsValue)(bounds && bounds.bottom || { units: 'Pixels', value: 0 }, 'bounds.bottom'),
            Rght: (0, descriptor_1.unitsValue)(bounds && bounds.right || { units: 'Pixels', value: 0 }, 'bounds.right'),
        }, uOrder: warp.uOrder || 0, vOrder: warp.vOrder || 0 });
    var isQuilt = isQuiltWarp(warp);
    if (isQuilt) {
        var desc2 = desc;
        desc2.deformNumRows = warp.deformNumRows || 0;
        desc2.deformNumCols = warp.deformNumCols || 0;
    }
    var customEnvelopeWarp = warp.customEnvelopeWarp;
    if (customEnvelopeWarp) {
        var meshPoints = customEnvelopeWarp.meshPoints || [];
        if (isQuilt) {
            var desc2 = desc;
            desc2.customEnvelopeWarp = {
                _name: '',
                _classID: 'customEnvelopeWarp',
                quiltSliceX: [{
                        type: 'quiltSliceX',
                        values: customEnvelopeWarp.quiltSliceX || [],
                    }],
                quiltSliceY: [{
                        type: 'quiltSliceY',
                        values: customEnvelopeWarp.quiltSliceY || [],
                    }],
                meshPoints: [
                    { type: 'Hrzn', values: meshPoints.map(function (p) { return p.x; }) },
                    { type: 'Vrtc', values: meshPoints.map(function (p) { return p.y; }) },
                ],
            };
        }
        else {
            desc.customEnvelopeWarp = {
                _name: '',
                _classID: 'customEnvelopeWarp',
                meshPoints: [
                    { type: 'Hrzn', values: meshPoints.map(function (p) { return p.x; }) },
                    { type: 'Vrtc', values: meshPoints.map(function (p) { return p.y; }) },
                ],
            };
        }
    }
    return desc;
}
addHandler('PlLd', hasKey('placedLayer'), function (reader, target, left) {
    if ((0, psdReader_1.readSignature)(reader) !== 'plcL')
        throw new Error("Invalid PlLd signature");
    if ((0, psdReader_1.readInt32)(reader) !== 3)
        throw new Error("Invalid PlLd version");
    var id = (0, psdReader_1.readPascalString)(reader, 1);
    var pageNumber = (0, psdReader_1.readInt32)(reader);
    var totalPages = (0, psdReader_1.readInt32)(reader); // TODO: check how this works ?
    (0, psdReader_1.readInt32)(reader); // anitAliasPolicy 16
    var placedLayerType = (0, psdReader_1.readInt32)(reader); // 0 = unknown, 1 = vector, 2 = raster, 3 = image stack
    if (!placedLayerTypes[placedLayerType])
        throw new Error('Invalid PlLd type');
    var transform = [];
    for (var i = 0; i < 8; i++)
        transform.push((0, psdReader_1.readFloat64)(reader)); // x, y of 4 corners of the transform
    var warpVersion = (0, psdReader_1.readInt32)(reader);
    if (warpVersion !== 0)
        throw new Error("Invalid Warp version ".concat(warpVersion));
    var warp = (0, descriptor_1.readVersionAndDescriptor)(reader);
    target.placedLayer = target.placedLayer || {
        id: id,
        type: placedLayerTypes[placedLayerType],
        pageNumber: pageNumber,
        totalPages: totalPages,
        transform: transform,
        warp: parseWarp(warp),
    };
    // console.log('PlLd warp', require('util').inspect(warp, false, 99, true));
    // console.log('PlLd', require('util').inspect(target.placedLayer, false, 99, true));
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var placed = target.placedLayer;
    (0, psdWriter_1.writeSignature)(writer, 'plcL');
    (0, psdWriter_1.writeInt32)(writer, 3); // version
    if (!placed.id || typeof placed.id !== 'string' || !/^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(placed.id)) {
        throw new Error('Placed layer ID must be in a GUID format (example: 20953ddb-9391-11ec-b4f1-c15674f50bc4)');
    }
    (0, psdWriter_1.writePascalString)(writer, placed.id, 1);
    (0, psdWriter_1.writeInt32)(writer, 1); // pageNumber
    (0, psdWriter_1.writeInt32)(writer, 1); // totalPages
    (0, psdWriter_1.writeInt32)(writer, 16); // anitAliasPolicy
    if (placedLayerTypes.indexOf(placed.type) === -1)
        throw new Error('Invalid placedLayer type');
    (0, psdWriter_1.writeInt32)(writer, placedLayerTypes.indexOf(placed.type));
    for (var i = 0; i < 8; i++)
        (0, psdWriter_1.writeFloat64)(writer, placed.transform[i]);
    (0, psdWriter_1.writeInt32)(writer, 0); // warp version
    var warp = getWarpFromPlacedLayer(placed);
    var isQuilt = isQuiltWarp(warp);
    var type = isQuilt ? 'quiltWarp' : 'warp';
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', type, encodeWarp(warp), type);
});
function uint8ToFloat32(array) {
    return new Float32Array(array.buffer.slice(array.byteOffset), 0, array.byteLength / 4);
}
function uint8ToUint32(array) {
    return new Uint32Array(array.buffer.slice(array.byteOffset), 0, array.byteLength / 4);
}
function toUint8(array) {
    return new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
}
function arrayToPoints(array) {
    var points = [];
    for (var i = 0; i < array.length; i += 2) {
        points.push({ x: array[i], y: array[i + 1] });
    }
    return points;
}
function pointsToArray(points) {
    var array = [];
    for (var i = 0; i < points.length; i++) {
        array.push(points[i].x, points[i].y);
    }
    return array;
}
function uint8ToPoints(array) {
    return arrayToPoints(uint8ToFloat32(array));
}
function hrznVrtcToPoint(desc) {
    return {
        x: (0, descriptor_1.parseUnits)(desc.Hrzn),
        y: (0, descriptor_1.parseUnits)(desc.Vrtc),
    };
}
function pointToHrznVrtc(point) {
    return {
        _name: '',
        _classID: 'Pnt ',
        Hrzn: (0, descriptor_1.unitsValue)(point.x, 'x'),
        Vrtc: (0, descriptor_1.unitsValue)(point.y, 'y'),
    };
}
function parseFilterFXItem(f) {
    var base = {
        name: f['Nm  '],
        opacity: (0, descriptor_1.parsePercent)(f.blendOptions.Opct),
        blendMode: descriptor_1.BlnM.decode(f.blendOptions['Md  ']),
        enabled: f.enab,
        hasOptions: f.hasoptions,
        foregroundColor: (0, descriptor_1.parseColor)(f.FrgC),
        backgroundColor: (0, descriptor_1.parseColor)(f.BckC),
    };
    switch (f.filterID) {
        case 1098281575: return __assign(__assign({}, base), { type: 'average' });
        case 1114403360: return __assign(__assign({}, base), { type: 'blur' });
        case 1114403405: return __assign(__assign({}, base), { type: 'blur more' });
        case 697: return __assign(__assign({}, base), { type: 'box blur', filter: {
                radius: (0, descriptor_1.parseUnits)(f.Fltr['Rds ']),
            } });
        case 1198747202: return __assign(__assign({}, base), { type: 'gaussian blur', filter: {
                radius: (0, descriptor_1.parseUnits)(f.Fltr['Rds ']),
            } });
        case 1299476034: return __assign(__assign({}, base), { type: 'motion blur', filter: {
                angle: f.Fltr.Angl,
                distance: (0, descriptor_1.parseUnits)(f.Fltr.Dstn),
            } });
        case 1382313026: return __assign(__assign({}, base), { type: 'radial blur', filter: {
                amount: f.Fltr.Amnt,
                method: descriptor_1.BlrM.decode(f.Fltr.BlrM),
                quality: descriptor_1.BlrQ.decode(f.Fltr.BlrQ),
            } });
        case 702: return __assign(__assign({}, base), { type: 'shape blur', filter: {
                radius: (0, descriptor_1.parseUnits)(f.Fltr['Rds ']),
                customShape: { name: f.Fltr.customShape['Nm  '], id: f.Fltr.customShape.Idnt },
            } });
        case 1399681602: return __assign(__assign({}, base), { type: 'smart blur', filter: {
                radius: f.Fltr['Rds '],
                threshold: f.Fltr.Thsh,
                quality: descriptor_1.SmBQ.decode(f.Fltr.SmBQ),
                mode: descriptor_1.SmBM.decode(f.Fltr.SmBM),
            } });
        case 701: return __assign(__assign({}, base), { type: 'surface blur', filter: {
                radius: (0, descriptor_1.parseUnits)(f.Fltr['Rds ']),
                threshold: f.Fltr.Thsh,
            } });
        case 1148416108: return __assign(__assign({}, base), { type: 'displace', filter: {
                horizontalScale: f.Fltr.HrzS,
                verticalScale: f.Fltr.VrtS,
                displacementMap: descriptor_1.DspM.decode(f.Fltr.DspM),
                undefinedAreas: descriptor_1.UndA.decode(f.Fltr.UndA),
                displacementFile: {
                    signature: f.Fltr.DspF.sig,
                    path: f.Fltr.DspF.path, // TODO: this is decoded incorrectly ???
                },
            } });
        case 1349411688: return __assign(__assign({}, base), { type: 'pinch', filter: {
                amount: f.Fltr.Amnt,
            } });
        case 1349284384: return __assign(__assign({}, base), { type: 'polar coordinates', filter: {
                conversion: descriptor_1.Cnvr.decode(f.Fltr.Cnvr),
            } });
        case 1383099493: return __assign(__assign({}, base), { type: 'ripple', filter: {
                amount: f.Fltr.Amnt,
                size: descriptor_1.RplS.decode(f.Fltr.RplS),
            } });
        case 1399353888: return __assign(__assign({}, base), { type: 'shear', filter: {
                shearPoints: f.Fltr.ShrP.map(function (p) { return ({ x: p.Hrzn, y: p.Vrtc }); }),
                shearStart: f.Fltr.ShrS,
                shearEnd: f.Fltr.ShrE,
                undefinedAreas: descriptor_1.UndA.decode(f.Fltr.UndA),
            } });
        case 1399875698: return __assign(__assign({}, base), { type: 'spherize', filter: {
                amount: f.Fltr.Amnt,
                mode: descriptor_1.SphM.decode(f.Fltr.SphM),
            } });
        case 1417114220: return __assign(__assign({}, base), { type: 'twirl', filter: {
                angle: f.Fltr.Angl,
            } });
        case 1466005093: return __assign(__assign({}, base), { type: 'wave', filter: {
                numberOfGenerators: f.Fltr.NmbG,
                type: descriptor_1.Wvtp.decode(f.Fltr.Wvtp),
                wavelength: { min: f.Fltr.WLMn, max: f.Fltr.WLMx },
                amplitude: { min: f.Fltr.AmMn, max: f.Fltr.AmMx },
                scale: { x: f.Fltr.SclH, y: f.Fltr.SclV },
                randomSeed: f.Fltr.RndS,
                undefinedAreas: descriptor_1.UndA.decode(f.Fltr.UndA),
            } });
        case 1516722791: return __assign(__assign({}, base), { type: 'zigzag', filter: {
                amount: f.Fltr.Amnt,
                ridges: f.Fltr.NmbR,
                style: descriptor_1.ZZTy.decode(f.Fltr.ZZTy),
            } });
        case 1097092723: return __assign(__assign({}, base), { type: 'add noise', filter: {
                amount: (0, descriptor_1.parsePercent)(f.Fltr.Nose),
                distribution: descriptor_1.Dstr.decode(f.Fltr.Dstr),
                monochromatic: f.Fltr.Mnch,
                randomSeed: f.Fltr.FlRs,
            } });
        case 1148416099: return __assign(__assign({}, base), { type: 'despeckle' });
        case 1148417107: return __assign(__assign({}, base), { type: 'dust and scratches', filter: {
                radius: f.Fltr['Rds '],
                threshold: f.Fltr.Thsh,
            } });
        case 1298427424: return __assign(__assign({}, base), { type: 'median', filter: {
                radius: (0, descriptor_1.parseUnits)(f.Fltr['Rds ']),
            } });
        case 633: return __assign(__assign({}, base), { type: 'reduce noise', filter: {
                preset: f.Fltr.preset,
                removeJpegArtifact: f.Fltr.removeJPEGArtifact,
                reduceColorNoise: (0, descriptor_1.parsePercent)(f.Fltr.ClNs),
                sharpenDetails: (0, descriptor_1.parsePercent)(f.Fltr.Shrp),
                channelDenoise: f.Fltr.channelDenoise.map(function (c) { return (__assign({ channels: c.Chnl.map(function (i) { return descriptor_1.Chnl.decode(i); }), amount: c.Amnt }, (c.EdgF ? { preserveDetails: c.EdgF } : {}))); }),
            } });
        case 1131180616: return __assign(__assign({}, base), { type: 'color halftone', filter: {
                radius: f.Fltr['Rds '],
                angle1: f.Fltr.Ang1,
                angle2: f.Fltr.Ang2,
                angle3: f.Fltr.Ang3,
                angle4: f.Fltr.Ang4,
            } });
        case 1131574132: return __assign(__assign({}, base), { type: 'crystallize', filter: {
                cellSize: f.Fltr.ClSz,
                randomSeed: f.Fltr.FlRs,
            } });
        case 1180922912: return __assign(__assign({}, base), { type: 'facet' });
        case 1181902701: return __assign(__assign({}, base), { type: 'fragment' });
        case 1299870830: return __assign(__assign({}, base), { type: 'mezzotint', filter: {
                type: descriptor_1.MztT.decode(f.Fltr.MztT),
                randomSeed: f.Fltr.FlRs,
            } });
        case 1299407648: return __assign(__assign({}, base), { type: 'mosaic', filter: {
                cellSize: (0, descriptor_1.parseUnits)(f.Fltr.ClSz),
            } });
        case 1349416044: return __assign(__assign({}, base), { type: 'pointillize', filter: {
                cellSize: f.Fltr.ClSz,
                randomSeed: f.Fltr.FlRs,
            } });
        case 1131177075: return __assign(__assign({}, base), { type: 'clouds', filter: {
                randomSeed: f.Fltr.FlRs,
            } });
        case 1147564611: return __assign(__assign({}, base), { type: 'difference clouds', filter: {
                randomSeed: f.Fltr.FlRs,
            } });
        case 1180856947: return __assign(__assign({}, base), { type: 'fibers', filter: {
                variance: f.Fltr.Vrnc,
                strength: f.Fltr.Strg,
                randomSeed: f.Fltr.RndS,
            } });
        case 1282306886: return __assign(__assign({}, base), { type: 'lens flare', filter: {
                brightness: f.Fltr.Brgh,
                position: { x: f.Fltr.FlrC.Hrzn, y: f.Fltr.FlrC.Vrtc },
                lensType: descriptor_1.Lns.decode(f.Fltr['Lns ']),
            } });
        case 1399353968: return __assign(__assign({}, base), { type: 'sharpen' });
        case 1399353925: return __assign(__assign({}, base), { type: 'sharpen edges' });
        case 1399353933: return __assign(__assign({}, base), { type: 'sharpen more' });
        case 698: return __assign(__assign({}, base), { type: 'smart sharpen', filter: {
                amount: (0, descriptor_1.parsePercent)(f.Fltr.Amnt),
                radius: (0, descriptor_1.parseUnits)(f.Fltr['Rds ']),
                threshold: f.Fltr.Thsh,
                angle: f.Fltr.Angl,
                moreAccurate: f.Fltr.moreAccurate,
                blur: descriptor_1.blurType.decode(f.Fltr.blur),
                preset: f.Fltr.preset,
                shadow: {
                    fadeAmount: (0, descriptor_1.parsePercent)(f.Fltr.sdwM.Amnt),
                    tonalWidth: (0, descriptor_1.parsePercent)(f.Fltr.sdwM.Wdth),
                    radius: f.Fltr.sdwM['Rds '],
                },
                highlight: {
                    fadeAmount: (0, descriptor_1.parsePercent)(f.Fltr.hglM.Amnt),
                    tonalWidth: (0, descriptor_1.parsePercent)(f.Fltr.hglM.Wdth),
                    radius: f.Fltr.hglM['Rds '],
                },
            } });
        case 1433301837: return __assign(__assign({}, base), { type: 'unsharp mask', filter: {
                amount: (0, descriptor_1.parsePercent)(f.Fltr.Amnt),
                radius: (0, descriptor_1.parseUnits)(f.Fltr['Rds ']),
                threshold: f.Fltr.Thsh,
            } });
        case 1147564832: return __assign(__assign({}, base), { type: 'diffuse', filter: {
                mode: descriptor_1.DfsM.decode(f.Fltr['Md  ']),
                randomSeed: f.Fltr.FlRs,
            } });
        case 1164796531: return __assign(__assign({}, base), { type: 'emboss', filter: {
                angle: f.Fltr.Angl,
                height: f.Fltr.Hght,
                amount: f.Fltr.Amnt,
            } });
        case 1165522034: return __assign(__assign({}, base), { type: 'extrude', filter: {
                type: descriptor_1.ExtT.decode(f.Fltr.ExtT),
                size: f.Fltr.ExtS,
                depth: f.Fltr.ExtD,
                depthMode: descriptor_1.ExtR.decode(f.Fltr.ExtR),
                randomSeed: f.Fltr.FlRs,
                solidFrontFaces: f.Fltr.ExtF,
                maskIncompleteBlocks: f.Fltr.ExtM,
            } });
        case 1181639749: return __assign(__assign({}, base), { type: 'find edges' });
        case 1399616122: return __assign(__assign({}, base), { type: 'solarize' });
        case 1416393504: return __assign(__assign({}, base), { type: 'tiles', filter: {
                numberOfTiles: f.Fltr.TlNm,
                maximumOffset: f.Fltr.TlOf,
                fillEmptyAreaWith: descriptor_1.FlCl.decode(f.Fltr.FlCl),
                randomSeed: f.Fltr.FlRs,
            } });
        case 1416782659: return __assign(__assign({}, base), { type: 'trace contour', filter: {
                level: f.Fltr['Lvl '],
                edge: descriptor_1.CntE.decode(f.Fltr['Edg ']),
            } });
        case 1466852384: return __assign(__assign({}, base), { type: 'wind', filter: {
                method: descriptor_1.WndM.decode(f.Fltr.WndM),
                direction: descriptor_1.Drct.decode(f.Fltr.Drct),
            } });
        case 1148089458: return __assign(__assign({}, base), { type: 'de-interlace', filter: {
                eliminate: descriptor_1.IntE.decode(f.Fltr.IntE),
                newFieldsBy: descriptor_1.IntC.decode(f.Fltr.IntC),
            } });
        case 1314149187: return __assign(__assign({}, base), { type: 'ntsc colors' });
        case 1131639917: return __assign(__assign({}, base), { type: 'custom', filter: {
                scale: f.Fltr['Scl '],
                offset: f.Fltr.Ofst,
                matrix: f.Fltr.Mtrx,
            } });
        case 1214736464: return __assign(__assign({}, base), { type: 'high pass', filter: {
                radius: (0, descriptor_1.parseUnits)(f.Fltr['Rds ']),
            } });
        case 1299737888: return __assign(__assign({}, base), { type: 'maximum', filter: {
                radius: (0, descriptor_1.parseUnits)(f.Fltr['Rds ']),
            } });
        case 1299082528: return __assign(__assign({}, base), { type: 'minimum', filter: {
                radius: (0, descriptor_1.parseUnits)(f.Fltr['Rds ']),
            } });
        case 1332114292: return __assign(__assign({}, base), { type: 'offset', filter: {
                horizontal: f.Fltr.Hrzn,
                vertical: f.Fltr.Vrtc,
                undefinedAreas: descriptor_1.FlMd.decode(f.Fltr['Fl  ']),
            } });
        case 991: return __assign(__assign({}, base), { type: 'puppet', filter: {
                rigidType: f.Fltr.rigidType,
                bounds: [
                    { x: f.Fltr.PuX0, y: f.Fltr.PuY0, },
                    { x: f.Fltr.PuX1, y: f.Fltr.PuY1, },
                    { x: f.Fltr.PuX2, y: f.Fltr.PuY2, },
                    { x: f.Fltr.PuX3, y: f.Fltr.PuY3, },
                ],
                puppetShapeList: f.Fltr.puppetShapeList.map(function (p) { return ({
                    rigidType: p.rigidType,
                    // TODO: VrsM
                    // TODO: VrsN
                    originalVertexArray: uint8ToPoints(p.originalVertexArray),
                    deformedVertexArray: uint8ToPoints(p.deformedVertexArray),
                    indexArray: Array.from(uint8ToUint32(p.indexArray)),
                    pinOffsets: arrayToPoints(p.pinOffsets),
                    posFinalPins: arrayToPoints(p.posFinalPins),
                    pinVertexIndices: p.pinVertexIndices,
                    selectedPin: p.selectedPin,
                    pinPosition: arrayToPoints(p.PinP),
                    pinRotation: p.PnRt,
                    pinOverlay: p.PnOv,
                    pinDepth: p.PnDp,
                    meshQuality: p.meshQuality,
                    meshExpansion: p.meshExpansion,
                    meshRigidity: p.meshRigidity,
                    imageResolution: p.imageResolution,
                    meshBoundaryPath: {
                        pathComponents: p.meshBoundaryPath.pathComponents.map(function (c) { return ({
                            shapeOperation: c.shapeOperation.split('.')[1],
                            paths: c.SbpL.map(function (t) { return ({
                                closed: t.Clsp,
                                points: t['Pts '].map(function (pt) { return ({
                                    anchor: hrznVrtcToPoint(pt.Anch),
                                    forward: hrznVrtcToPoint(pt['Fwd ']),
                                    backward: hrznVrtcToPoint(pt['Bwd ']),
                                    smooth: pt.Smoo,
                                }); }),
                            }); }),
                        }); }),
                    },
                }); }),
            } });
        case 1348620396: {
            var parameters = [];
            var Flrt = f.Fltr;
            for (var i = 0; i < fromAtoZ.length; i++) {
                if (!Flrt["PN".concat(fromAtoZ[i], "a")])
                    break;
                for (var j = 0; j < fromAtoZ.length; j++) {
                    if (!Flrt["PN".concat(fromAtoZ[i]).concat(fromAtoZ[j])])
                        break;
                    parameters.push({
                        name: Flrt["PN".concat(fromAtoZ[i]).concat(fromAtoZ[j])],
                        value: Flrt["PF".concat(fromAtoZ[i]).concat(fromAtoZ[j])]
                    });
                }
            }
            return __assign(__assign({}, base), { type: 'oil paint plugin', filter: {
                    name: f.Fltr.KnNm,
                    gpu: f.Fltr.GpuY,
                    lighting: f.Fltr.LIWy,
                    parameters: parameters,
                } });
        }
        // case 2089: return {
        // 	...base,
        // 	type: 'adaptive wide angle',
        // 	params: {
        // 		correction: prjM.decode(f.Fltr.prjM),
        // 		focalLength: f.Fltr.focL,
        // 		cropFactor: f.Fltr.CrpF,
        // 		imageScale: f.Fltr.imgS,
        // 		imageX: f.Fltr.imgX,
        // 		imageY: f.Fltr.imgY,
        // 	},
        // };
        case 1215521360: return __assign(__assign({}, base), { type: 'hsb/hsl', filter: {
                inputMode: descriptor_1.ClrS.decode(f.Fltr.Inpt),
                rowOrder: descriptor_1.ClrS.decode(f.Fltr.Otpt),
            } });
        case 1122: return __assign(__assign({}, base), { type: 'oil paint', filter: {
                lightingOn: f.Fltr.lightingOn,
                stylization: f.Fltr.stylization,
                cleanliness: f.Fltr.cleanliness,
                brushScale: f.Fltr.brushScale,
                microBrush: f.Fltr.microBrush,
                lightDirection: f.Fltr.LghD,
                specularity: f.Fltr.specularity,
            } });
        case 1282492025: {
            return __assign(__assign({}, base), { type: 'liquify', filter: {
                    liquifyMesh: f.Fltr.LqMe,
                } });
        }
        default:
            throw new Error("Unknown filterID: ".concat(f.filterID));
    }
}
function parseFilterFX(desc) {
    return {
        enabled: desc.enab,
        validAtPosition: desc.validAtPosition,
        maskEnabled: desc.filterMaskEnable,
        maskLinked: desc.filterMaskLinked,
        maskExtendWithWhite: desc.filterMaskExtendWithWhite,
        list: desc.filterFXList.map(parseFilterFXItem),
    };
}
function uvRadius(t) {
    return (0, descriptor_1.unitsValue)(t.radius, 'radius');
}
function serializeFilterFXItem(f) {
    var base = {
        _name: '',
        _classID: 'filterFX',
        'Nm  ': f.name,
        blendOptions: {
            _name: '',
            _classID: 'blendOptions',
            Opct: (0, descriptor_1.unitsPercentF)(f.opacity),
            'Md  ': descriptor_1.BlnM.encode(f.blendMode),
        },
        enab: f.enabled,
        hasoptions: f.hasOptions,
        FrgC: (0, descriptor_1.serializeColor)(f.foregroundColor),
        BckC: (0, descriptor_1.serializeColor)(f.backgroundColor),
    };
    switch (f.type) {
        case 'average': return __assign(__assign({}, base), { filterID: 1098281575 });
        case 'blur': return __assign(__assign({}, base), { filterID: 1114403360 });
        case 'blur more': return __assign(__assign({}, base), { filterID: 1114403405 });
        case 'box blur': return __assign(__assign({}, base), { Fltr: {
                _name: 'Box Blur',
                _classID: 'boxblur',
                'Rds ': uvRadius(f.filter),
            }, filterID: 697 });
        case 'gaussian blur': return __assign(__assign({}, base), { Fltr: {
                _name: 'Gaussian Blur',
                _classID: 'GsnB',
                'Rds ': uvRadius(f.filter),
            }, filterID: 1198747202 });
        case 'motion blur': return __assign(__assign({}, base), { Fltr: {
                _name: 'Motion Blur',
                _classID: 'MtnB',
                Angl: f.filter.angle,
                Dstn: (0, descriptor_1.unitsValue)(f.filter.distance, 'distance'),
            }, filterID: 1299476034 });
        case 'radial blur': return __assign(__assign({}, base), { Fltr: {
                _name: 'Radial Blur',
                _classID: 'RdlB',
                Amnt: f.filter.amount,
                BlrM: descriptor_1.BlrM.encode(f.filter.method),
                BlrQ: descriptor_1.BlrQ.encode(f.filter.quality),
            }, filterID: 1382313026 });
        case 'shape blur': return __assign(__assign({}, base), { Fltr: {
                _name: 'Shape Blur',
                _classID: 'shapeBlur',
                'Rds ': uvRadius(f.filter),
                customShape: {
                    _name: '',
                    _classID: 'customShape',
                    'Nm  ': f.filter.customShape.name,
                    Idnt: f.filter.customShape.id,
                }
            }, filterID: 702 });
        case 'smart blur': return __assign(__assign({}, base), { Fltr: {
                _name: 'Smart Blur',
                _classID: 'SmrB',
                'Rds ': f.filter.radius,
                Thsh: f.filter.threshold,
                SmBQ: descriptor_1.SmBQ.encode(f.filter.quality),
                SmBM: descriptor_1.SmBM.encode(f.filter.mode),
            }, filterID: 1399681602 });
        case 'surface blur': return __assign(__assign({}, base), { Fltr: {
                _name: 'Surface Blur',
                _classID: 'surfaceBlur',
                'Rds ': uvRadius(f.filter),
                Thsh: f.filter.threshold,
            }, filterID: 701 });
        case 'displace': return __assign(__assign({}, base), { Fltr: {
                _name: 'Displace',
                _classID: 'Dspl',
                HrzS: f.filter.horizontalScale,
                VrtS: f.filter.verticalScale,
                DspM: descriptor_1.DspM.encode(f.filter.displacementMap),
                UndA: descriptor_1.UndA.encode(f.filter.undefinedAreas),
                DspF: {
                    sig: f.filter.displacementFile.signature,
                    path: f.filter.displacementFile.path,
                },
            }, filterID: 1148416108 });
        case 'pinch': return __assign(__assign({}, base), { Fltr: {
                _name: 'Pinch',
                _classID: 'Pnch',
                Amnt: f.filter.amount,
            }, filterID: 1349411688 });
        case 'polar coordinates': return __assign(__assign({}, base), { Fltr: {
                _name: 'Polar Coordinates',
                _classID: 'Plr ',
                Cnvr: descriptor_1.Cnvr.encode(f.filter.conversion),
            }, filterID: 1349284384 });
        case 'ripple': return __assign(__assign({}, base), { Fltr: {
                _name: 'Ripple',
                _classID: 'Rple',
                Amnt: f.filter.amount,
                RplS: descriptor_1.RplS.encode(f.filter.size),
            }, filterID: 1383099493 });
        case 'shear': return __assign(__assign({}, base), { Fltr: {
                _name: 'Shear',
                _classID: 'Shr ',
                ShrP: f.filter.shearPoints.map(function (p) { return ({ _name: '', _classID: 'Pnt ', Hrzn: p.x, Vrtc: p.y }); }),
                UndA: descriptor_1.UndA.encode(f.filter.undefinedAreas),
                ShrS: f.filter.shearStart,
                ShrE: f.filter.shearEnd,
            }, filterID: 1399353888 });
        case 'spherize': return __assign(__assign({}, base), { Fltr: {
                _name: 'Spherize',
                _classID: 'Sphr',
                Amnt: f.filter.amount,
                SphM: descriptor_1.SphM.encode(f.filter.mode),
            }, filterID: 1399875698 });
        case 'twirl': return __assign(__assign({}, base), { Fltr: {
                _name: 'Twirl',
                _classID: 'Twrl',
                Angl: f.filter.angle,
            }, filterID: 1417114220 });
        case 'wave': return __assign(__assign({}, base), { Fltr: {
                _name: 'Wave',
                _classID: 'Wave',
                Wvtp: descriptor_1.Wvtp.encode(f.filter.type),
                NmbG: f.filter.numberOfGenerators,
                WLMn: f.filter.wavelength.min,
                WLMx: f.filter.wavelength.max,
                AmMn: f.filter.amplitude.min,
                AmMx: f.filter.amplitude.max,
                SclH: f.filter.scale.x,
                SclV: f.filter.scale.y,
                UndA: descriptor_1.UndA.encode(f.filter.undefinedAreas),
                RndS: f.filter.randomSeed,
            }, filterID: 1466005093 });
        case 'zigzag': return __assign(__assign({}, base), { Fltr: {
                _name: 'ZigZag',
                _classID: 'ZgZg',
                Amnt: f.filter.amount,
                NmbR: f.filter.ridges,
                ZZTy: descriptor_1.ZZTy.encode(f.filter.style),
            }, filterID: 1516722791 });
        case 'add noise': return __assign(__assign({}, base), { Fltr: {
                _name: 'Add Noise',
                _classID: 'AdNs',
                Dstr: descriptor_1.Dstr.encode(f.filter.distribution),
                Nose: (0, descriptor_1.unitsPercentF)(f.filter.amount),
                Mnch: f.filter.monochromatic,
                FlRs: f.filter.randomSeed,
            }, filterID: 1097092723 });
        case 'despeckle': return __assign(__assign({}, base), { filterID: 1148416099 });
        case 'dust and scratches': return __assign(__assign({}, base), { Fltr: {
                _name: 'Dust & Scratches',
                _classID: 'DstS',
                'Rds ': f.filter.radius,
                Thsh: f.filter.threshold,
            }, filterID: 1148417107 });
        case 'median': return __assign(__assign({}, base), { Fltr: {
                _name: 'Median',
                _classID: 'Mdn ',
                'Rds ': uvRadius(f.filter),
            }, filterID: 1298427424 });
        case 'reduce noise': return __assign(__assign({}, base), { Fltr: {
                _name: 'Reduce Noise',
                _classID: 'denoise',
                ClNs: (0, descriptor_1.unitsPercentF)(f.filter.reduceColorNoise),
                Shrp: (0, descriptor_1.unitsPercentF)(f.filter.sharpenDetails),
                removeJPEGArtifact: f.filter.removeJpegArtifact,
                channelDenoise: f.filter.channelDenoise.map(function (c) { return (__assign({ _name: '', _classID: 'channelDenoiseParams', Chnl: c.channels.map(function (i) { return descriptor_1.Chnl.encode(i); }), Amnt: c.amount }, (c.preserveDetails ? { EdgF: c.preserveDetails } : {}))); }),
                preset: f.filter.preset,
            }, filterID: 633 });
        case 'color halftone': return __assign(__assign({}, base), { Fltr: {
                _name: 'Color Halftone',
                _classID: 'ClrH',
                'Rds ': f.filter.radius,
                Ang1: f.filter.angle1,
                Ang2: f.filter.angle2,
                Ang3: f.filter.angle3,
                Ang4: f.filter.angle4,
            }, filterID: 1131180616 });
        case 'crystallize': return __assign(__assign({}, base), { Fltr: {
                _name: 'Crystallize',
                _classID: 'Crst',
                ClSz: f.filter.cellSize,
                FlRs: f.filter.randomSeed,
            }, filterID: 1131574132 });
        case 'facet': return __assign(__assign({}, base), { filterID: 1180922912 });
        case 'fragment': return __assign(__assign({}, base), { filterID: 1181902701 });
        case 'mezzotint': return __assign(__assign({}, base), { Fltr: {
                _name: 'Mezzotint',
                _classID: 'Mztn',
                MztT: descriptor_1.MztT.encode(f.filter.type),
                FlRs: f.filter.randomSeed,
            }, filterID: 1299870830 });
        case 'mosaic': return __assign(__assign({}, base), { Fltr: {
                _name: 'Mosaic',
                _classID: 'Msc ',
                ClSz: (0, descriptor_1.unitsValue)(f.filter.cellSize, 'cellSize'),
            }, filterID: 1299407648 });
        case 'pointillize': return __assign(__assign({}, base), { Fltr: {
                _name: 'Pointillize',
                _classID: 'Pntl',
                ClSz: f.filter.cellSize,
                FlRs: f.filter.randomSeed,
            }, filterID: 1349416044 });
        case 'clouds': return __assign(__assign({}, base), { Fltr: {
                _name: 'Clouds',
                _classID: 'Clds',
                FlRs: f.filter.randomSeed,
            }, filterID: 1131177075 });
        case 'difference clouds': return __assign(__assign({}, base), { Fltr: {
                _name: 'Difference Clouds',
                _classID: 'DfrC',
                FlRs: f.filter.randomSeed,
            }, filterID: 1147564611 });
        case 'fibers': return __assign(__assign({}, base), { Fltr: {
                _name: 'Fibers',
                _classID: 'Fbrs',
                Vrnc: f.filter.variance,
                Strg: f.filter.strength,
                RndS: f.filter.randomSeed,
            }, filterID: 1180856947 });
        case 'lens flare': return __assign(__assign({}, base), { Fltr: {
                _name: 'Lens Flare',
                _classID: 'LnsF',
                Brgh: f.filter.brightness,
                FlrC: {
                    _name: '',
                    _classID: 'Pnt ',
                    Hrzn: f.filter.position.x,
                    Vrtc: f.filter.position.y,
                },
                'Lns ': descriptor_1.Lns.encode(f.filter.lensType),
            }, filterID: 1282306886 });
        case 'sharpen': return __assign(__assign({}, base), { filterID: 1399353968 });
        case 'sharpen edges': return __assign(__assign({}, base), { filterID: 1399353925 });
        case 'sharpen more': return __assign(__assign({}, base), { filterID: 1399353933 });
        case 'smart sharpen': return __assign(__assign({}, base), { Fltr: {
                _name: 'Smart Sharpen',
                _classID: 'smartSharpen',
                Amnt: (0, descriptor_1.unitsPercentF)(f.filter.amount),
                'Rds ': uvRadius(f.filter),
                Thsh: f.filter.threshold,
                Angl: f.filter.angle,
                moreAccurate: f.filter.moreAccurate,
                blur: descriptor_1.blurType.encode(f.filter.blur),
                preset: f.filter.preset,
                sdwM: {
                    _name: 'Parameters',
                    _classID: 'adaptCorrectTones',
                    Amnt: (0, descriptor_1.unitsPercentF)(f.filter.shadow.fadeAmount),
                    Wdth: (0, descriptor_1.unitsPercentF)(f.filter.shadow.tonalWidth),
                    'Rds ': f.filter.shadow.radius,
                },
                hglM: {
                    _name: 'Parameters',
                    _classID: 'adaptCorrectTones',
                    Amnt: (0, descriptor_1.unitsPercentF)(f.filter.highlight.fadeAmount),
                    Wdth: (0, descriptor_1.unitsPercentF)(f.filter.highlight.tonalWidth),
                    'Rds ': f.filter.highlight.radius,
                },
            }, filterID: 698 });
        case 'unsharp mask': return __assign(__assign({}, base), { Fltr: {
                _name: 'Unsharp Mask',
                _classID: 'UnsM',
                Amnt: (0, descriptor_1.unitsPercentF)(f.filter.amount),
                'Rds ': uvRadius(f.filter),
                Thsh: f.filter.threshold,
            }, filterID: 1433301837 });
        case 'diffuse': return __assign(__assign({}, base), { Fltr: {
                _name: 'Diffuse',
                _classID: 'Dfs ',
                'Md  ': descriptor_1.DfsM.encode(f.filter.mode),
                FlRs: f.filter.randomSeed,
            }, filterID: 1147564832 });
        case 'emboss': return __assign(__assign({}, base), { Fltr: {
                _name: 'Emboss',
                _classID: 'Embs',
                Angl: f.filter.angle,
                Hght: f.filter.height,
                Amnt: f.filter.amount,
            }, filterID: 1164796531 });
        case 'extrude': return __assign(__assign({}, base), { Fltr: {
                _name: 'Extrude',
                _classID: 'Extr',
                ExtS: f.filter.size,
                ExtD: f.filter.depth,
                ExtF: f.filter.solidFrontFaces,
                ExtM: f.filter.maskIncompleteBlocks,
                ExtT: descriptor_1.ExtT.encode(f.filter.type),
                ExtR: descriptor_1.ExtR.encode(f.filter.depthMode),
                FlRs: f.filter.randomSeed,
            }, filterID: 1165522034 });
        case 'find edges': return __assign(__assign({}, base), { filterID: 1181639749 });
        case 'solarize': return __assign(__assign({}, base), { filterID: 1399616122 });
        case 'tiles': return __assign(__assign({}, base), { Fltr: {
                _name: 'Tiles',
                _classID: 'Tls ',
                TlNm: f.filter.numberOfTiles,
                TlOf: f.filter.maximumOffset,
                FlCl: descriptor_1.FlCl.encode(f.filter.fillEmptyAreaWith),
                FlRs: f.filter.randomSeed,
            }, filterID: 1416393504 });
        case 'trace contour': return __assign(__assign({}, base), { Fltr: {
                _name: 'Trace Contour',
                _classID: 'TrcC',
                'Lvl ': f.filter.level,
                'Edg ': descriptor_1.CntE.encode(f.filter.edge),
            }, filterID: 1416782659 });
        case 'wind': return __assign(__assign({}, base), { Fltr: {
                _name: 'Wind',
                _classID: 'Wnd ',
                WndM: descriptor_1.WndM.encode(f.filter.method),
                Drct: descriptor_1.Drct.encode(f.filter.direction),
            }, filterID: 1466852384 });
        case 'de-interlace': return __assign(__assign({}, base), { Fltr: {
                _name: 'De-Interlace',
                _classID: 'Dntr',
                IntE: descriptor_1.IntE.encode(f.filter.eliminate),
                IntC: descriptor_1.IntC.encode(f.filter.newFieldsBy),
            }, filterID: 1148089458 });
        case 'ntsc colors': return __assign(__assign({}, base), { filterID: 1314149187 });
        case 'custom': return __assign(__assign({}, base), { Fltr: {
                _name: 'Custom',
                _classID: 'Cstm',
                'Scl ': f.filter.scale,
                Ofst: f.filter.offset,
                Mtrx: f.filter.matrix,
            }, filterID: 1131639917 });
        case 'high pass': return __assign(__assign({}, base), { Fltr: {
                _name: 'High Pass',
                _classID: 'HghP',
                'Rds ': uvRadius(f.filter),
            }, filterID: 1214736464 });
        case 'maximum': return __assign(__assign({}, base), { Fltr: {
                _name: 'Maximum',
                _classID: 'Mxm ',
                'Rds ': uvRadius(f.filter),
            }, filterID: 1299737888 });
        case 'minimum': return __assign(__assign({}, base), { Fltr: {
                _name: 'Minimum',
                _classID: 'Mnm ',
                'Rds ': uvRadius(f.filter),
            }, filterID: 1299082528 });
        case 'offset': return __assign(__assign({}, base), { Fltr: {
                _name: 'Offset',
                _classID: 'Ofst',
                Hrzn: f.filter.horizontal,
                Vrtc: f.filter.vertical,
                'Fl  ': descriptor_1.FlMd.encode(f.filter.undefinedAreas),
            }, filterID: 1332114292 });
        case 'puppet': return __assign(__assign({}, base), { Fltr: {
                _name: 'Rigid Transform',
                _classID: 'rigidTransform',
                'null': ['Ordn.Trgt'],
                rigidType: f.filter.rigidType,
                puppetShapeList: f.filter.puppetShapeList.map(function (p) { return ({
                    _name: '',
                    _classID: 'puppetShape',
                    rigidType: p.rigidType,
                    VrsM: 1,
                    VrsN: 0,
                    originalVertexArray: toUint8(new Float32Array(pointsToArray(p.originalVertexArray))),
                    deformedVertexArray: toUint8(new Float32Array(pointsToArray(p.deformedVertexArray))),
                    indexArray: toUint8(new Uint32Array(p.indexArray)),
                    pinOffsets: pointsToArray(p.pinOffsets),
                    posFinalPins: pointsToArray(p.posFinalPins),
                    pinVertexIndices: p.pinVertexIndices,
                    PinP: pointsToArray(p.pinPosition),
                    PnRt: p.pinRotation,
                    PnOv: p.pinOverlay,
                    PnDp: p.pinDepth,
                    meshQuality: p.meshQuality,
                    meshExpansion: p.meshExpansion,
                    meshRigidity: p.meshRigidity,
                    imageResolution: p.imageResolution,
                    meshBoundaryPath: {
                        _name: '',
                        _classID: 'pathClass',
                        pathComponents: p.meshBoundaryPath.pathComponents.map(function (c) { return ({
                            _name: '',
                            _classID: 'PaCm',
                            shapeOperation: "shapeOperation.".concat(c.shapeOperation),
                            SbpL: c.paths.map(function (path) { return ({
                                _name: '',
                                _classID: 'Sbpl',
                                Clsp: path.closed,
                                'Pts ': path.points.map(function (pt) { return ({
                                    _name: '',
                                    _classID: 'Pthp',
                                    Anch: pointToHrznVrtc(pt.anchor),
                                    'Fwd ': pointToHrznVrtc(pt.forward),
                                    'Bwd ': pointToHrznVrtc(pt.backward),
                                    Smoo: pt.smooth,
                                }); }),
                            }); }),
                        }); }),
                    },
                    selectedPin: p.selectedPin,
                }); }),
                PuX0: f.filter.bounds[0].x,
                PuX1: f.filter.bounds[1].x,
                PuX2: f.filter.bounds[2].x,
                PuX3: f.filter.bounds[3].x,
                PuY0: f.filter.bounds[0].y,
                PuY1: f.filter.bounds[1].y,
                PuY2: f.filter.bounds[2].y,
                PuY3: f.filter.bounds[3].y,
            }, filterID: 991 });
        case 'oil paint plugin': {
            var params = {};
            for (var i = 0; i < f.filter.parameters.length; i++) {
                var _a = f.filter.parameters[i], name_1 = _a.name, value = _a.value;
                var suffix = "".concat(fromAtoZ[Math.floor(i / fromAtoZ.length)]).concat(fromAtoZ[i % fromAtoZ.length]);
                params["PN".concat(suffix)] = name_1;
                params["PT".concat(suffix)] = 0;
                params["PF".concat(suffix)] = value;
            }
            return __assign(__assign({}, base), { Fltr: __assign({ _name: 'Oil Paint Plugin', _classID: 'PbPl', KnNm: f.filter.name, GpuY: f.filter.gpu, LIWy: f.filter.lighting, FPth: '1' }, params), filterID: 1348620396 });
        }
        case 'oil paint': return __assign(__assign({}, base), { Fltr: {
                _name: 'Oil Paint',
                _classID: 'oilPaint',
                lightingOn: f.filter.lightingOn,
                stylization: f.filter.stylization,
                cleanliness: f.filter.cleanliness,
                brushScale: f.filter.brushScale,
                microBrush: f.filter.microBrush,
                LghD: f.filter.lightDirection,
                specularity: f.filter.specularity,
            }, filterID: 1122 });
        case 'liquify': return __assign(__assign({}, base), { Fltr: {
                _name: 'Liquify',
                _classID: 'LqFy',
                LqMe: f.filter.liquifyMesh,
            }, filterID: 1282492025 });
        default: throw new Error("Unknow filter type: ".concat(f.type));
    }
}
// let t: any;
function getWarpFromPlacedLayer(placed) {
    if (placed.warp)
        return placed.warp;
    if (!placed.width || !placed.height)
        throw new Error('You must provide width and height of the linked image in placedLayer');
    var w = placed.width;
    var h = placed.height;
    var x0 = 0, x1 = w / 3, x2 = w * 2 / 3, x3 = w;
    var y0 = 0, y1 = h / 3, y2 = h * 2 / 3, y3 = h;
    return {
        style: 'custom',
        value: 0,
        perspective: 0,
        perspectiveOther: 0,
        rotate: 'horizontal',
        bounds: {
            top: { value: 0, units: 'Pixels' },
            left: { value: 0, units: 'Pixels' },
            bottom: { value: h, units: 'Pixels' },
            right: { value: w, units: 'Pixels' },
        },
        uOrder: 4,
        vOrder: 4,
        customEnvelopeWarp: {
            meshPoints: [
                { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x2, y: y0 }, { x: x3, y: y0 },
                { x: x0, y: y1 }, { x: x1, y: y1 }, { x: x2, y: y1 }, { x: x3, y: y1 },
                { x: x0, y: y2 }, { x: x1, y: y2 }, { x: x2, y: y2 }, { x: x3, y: y2 },
                { x: x0, y: y3 }, { x: x1, y: y3 }, { x: x2, y: y3 }, { x: x3, y: y3 },
            ],
        },
    };
}
addHandler('SoLd', hasKey('placedLayer'), function (reader, target, left) {
    if ((0, psdReader_1.readSignature)(reader) !== 'soLD')
        throw new Error("Invalid SoLd type");
    var version = (0, psdReader_1.readInt32)(reader);
    if (version !== 4 && version !== 5)
        throw new Error("Invalid SoLd version");
    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
    // console.log('SoLd', require('util').inspect(desc, false, 99, true));
    // console.log('SoLd.warp', require('util').inspect(desc.warp, false, 99, true));
    // console.log('SoLd.quiltWarp', require('util').inspect(desc.quiltWarp, false, 99, true));
    // desc.filterFX!.filterFXList[0].Fltr.puppetShapeList[0].meshBoundaryPath.pathComponents[0].SbpL[0]['Pts '] = [];
    // console.log('read', require('util').inspect(desc.filterFX, false, 99, true));
    // console.log('filterFXList[0]', require('util').inspect((desc as any).filterFX.filterFXList[0], false, 99, true));
    // t = desc;
    target.placedLayer = {
        id: desc.Idnt,
        placed: desc.placed,
        type: placedLayerTypes[desc.Type],
        pageNumber: desc.PgNm,
        totalPages: desc.totalPages,
        frameStep: (0, descriptor_1.frac)(desc.frameStep),
        duration: (0, descriptor_1.frac)(desc.duration),
        frameCount: desc.frameCount,
        transform: desc.Trnf,
        width: desc['Sz  '].Wdth,
        height: desc['Sz  '].Hght,
        resolution: (0, descriptor_1.parseUnits)(desc.Rslt),
        warp: parseWarp((desc.quiltWarp || desc.warp)),
    };
    if (desc.nonAffineTransform && desc.nonAffineTransform.some(function (x, i) { return x !== desc.Trnf[i]; })) {
        target.placedLayer.nonAffineTransform = desc.nonAffineTransform;
    }
    if (desc.Crop)
        target.placedLayer.crop = desc.Crop;
    if (desc.comp)
        target.placedLayer.comp = desc.comp;
    if (desc.compInfo) {
        target.placedLayer.compInfo = {
            compID: desc.compInfo.compID,
            originalCompID: desc.compInfo.originalCompID,
        };
    }
    if (desc.filterFX)
        target.placedLayer.filter = parseFilterFX(desc.filterFX);
    // console.log('filter', require('util').inspect(target.placedLayer.filter, false, 99, true));
    (0, psdReader_1.skipBytes)(reader, left()); // HACK
}, function (writer, target) {
    var _a, _b;
    (0, psdWriter_1.writeSignature)(writer, 'soLD');
    (0, psdWriter_1.writeInt32)(writer, 4); // version
    var placed = target.placedLayer;
    if (!placed.id || typeof placed.id !== 'string' || !/^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(placed.id)) {
        throw new Error('Placed layer ID must be in a GUID format (example: 20953ddb-9391-11ec-b4f1-c15674f50bc4)');
    }
    var desc = __assign(__assign({ Idnt: placed.id, placed: (_a = placed.placed) !== null && _a !== void 0 ? _a : placed.id, PgNm: placed.pageNumber || 1, totalPages: placed.totalPages || 1 }, (placed.crop ? { Crop: placed.crop } : {})), { frameStep: placed.frameStep || { numerator: 0, denominator: 600 }, duration: placed.duration || { numerator: 0, denominator: 600 }, frameCount: placed.frameCount || 0, Annt: 16, Type: placedLayerTypes.indexOf(placed.type), Trnf: placed.transform, nonAffineTransform: (_b = placed.nonAffineTransform) !== null && _b !== void 0 ? _b : placed.transform, 
        // quiltWarp: {} as any,
        warp: encodeWarp(getWarpFromPlacedLayer(placed)), 'Sz  ': {
            _name: '',
            _classID: 'Pnt ',
            Wdth: placed.width || 0,
            Hght: placed.height || 0, // TODO: find size ?
        }, Rslt: placed.resolution ? (0, descriptor_1.unitsValue)(placed.resolution, 'resolution') : { units: 'Density', value: 72 } });
    if (placed.filter) {
        desc.filterFX = {
            _name: '',
            _classID: 'filterFXStyle',
            enab: placed.filter.enabled,
            validAtPosition: placed.filter.validAtPosition,
            filterMaskEnable: placed.filter.maskEnabled,
            filterMaskLinked: placed.filter.maskLinked,
            filterMaskExtendWithWhite: placed.filter.maskExtendWithWhite,
            filterFXList: placed.filter.list.map(function (f) { return serializeFilterFXItem(f); }),
        };
    }
    // console.log('write', require('util').inspect(desc.filterFX, false, 99, true)); ///
    // if (JSON.stringify(t) !== JSON.stringify(desc)) {
    // 	console.log('read', require('util').inspect(t, false, 99, true));
    // 	console.log('write', require('util').inspect(desc, false, 99, true));
    // 	console.error('DIFFERENT');
    // 	// throw new Error('DIFFERENT');
    // }
    if (placed.warp && isQuiltWarp(placed.warp)) {
        var quiltWarp = encodeWarp(placed.warp);
        desc.quiltWarp = quiltWarp;
        desc.warp = {
            warpStyle: 'warpStyle.warpNone',
            warpValue: quiltWarp.warpValue,
            warpPerspective: quiltWarp.warpPerspective,
            warpPerspectiveOther: quiltWarp.warpPerspectiveOther,
            warpRotate: quiltWarp.warpRotate,
            bounds: quiltWarp.bounds,
            uOrder: quiltWarp.uOrder,
            vOrder: quiltWarp.vOrder,
        };
    }
    else {
        delete desc.quiltWarp;
    }
    if (placed.comp)
        desc.comp = placed.comp;
    if (placed.compInfo)
        desc.compInfo = placed.compInfo;
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc, desc.quiltWarp ? 'quiltWarp' : 'warp');
});
addHandlerAlias('SoLE', 'SoLd');
addHandler('fxrp', hasKey('referencePoint'), function (reader, target) {
    target.referencePoint = {
        x: (0, psdReader_1.readFloat64)(reader),
        y: (0, psdReader_1.readFloat64)(reader),
    };
}, function (writer, target) {
    (0, psdWriter_1.writeFloat64)(writer, target.referencePoint.x);
    (0, psdWriter_1.writeFloat64)(writer, target.referencePoint.y);
});
addHandler('Lr16', function () { return false; }, function (reader, _target, _left, psd, options) {
    (0, psdReader_1.readLayerInfo)(reader, psd, options);
}, function (_writer, _target) {
});
addHandler('Lr32', function () { return false; }, function (reader, _target, _left, psd, options) {
    (0, psdReader_1.readLayerInfo)(reader, psd, options);
}, function (_writer, _target) {
});
addHandler('LMsk', hasKey('userMask'), function (reader, target) {
    target.userMask = {
        colorSpace: (0, psdReader_1.readColor)(reader),
        opacity: (0, psdReader_1.readUint16)(reader) / 0xff,
    };
    var flag = (0, psdReader_1.readUint8)(reader);
    if (flag !== 128)
        throw new Error('Invalid flag value');
    (0, psdReader_1.skipBytes)(reader, 1);
}, function (writer, target) {
    var userMask = target.userMask;
    (0, psdWriter_1.writeColor)(writer, userMask.colorSpace);
    (0, psdWriter_1.writeUint16)(writer, (0, helpers_1.clamp)(userMask.opacity, 0, 1) * 0xff);
    (0, psdWriter_1.writeUint8)(writer, 128);
    (0, psdWriter_1.writeZeros)(writer, 1);
});
if (helpers_1.MOCK_HANDLERS) {
    addHandler('vowv', // appears with Lr16 section ?
    function (// appears with Lr16 section ?
    _) { return false; }, function (reader, target, left) {
        var value = (0, psdReader_1.readUint32)(reader); // 2 ????
        reader;
        target;
        console.log('vowv', { value: value }, left());
    }, function (_writer, _target) {
        // TODO: write
    });
}
if (helpers_1.MOCK_HANDLERS) {
    addHandler('Patt', function (target) { return target._Patt !== undefined; }, function (reader, target, left) {
        // console.log('additional info: Patt');
        target._Patt = (0, psdReader_1.readBytes)(reader, left());
    }, function (writer, target) { return false && (0, psdWriter_1.writeBytes)(writer, target._Patt); });
}
else {
    addHandler('Patt', // TODO: handle also Pat2 & Pat3
    function (// TODO: handle also Pat2 & Pat3
    target) { return !target; }, function (reader, target, left) {
        if (!left())
            return;
        (0, psdReader_1.skipBytes)(reader, left());
        return; // not supported yet
        target;
        psdReader_1.readPattern;
        // if (!target.patterns) target.patterns = [];
        // target.patterns.push(readPattern(reader));
        // skipBytes(reader, left());
    }, function (_writer, _target) {
    });
}
/*
interface CAIDesc {
    enab: boolean;
    generationalGuid: string;
}

addHandler(
    'CAI ', // content credentials ? something to do with generative tech
    () => false,
    (reader, _target, left) => {
        const version = readUint32(reader); // 3
        const desc = readVersionAndDescriptor(reader) as CAIDesc;
        console.log('CAI', require('util').inspect(desc, false, 99, true));
        console.log('CAI', { version });
        console.log('CAI left', readBytes(reader, left())); // 8 bytes left, all zeroes
    },
    (_writer, _target) => {
    },
);
*/
/*
interface GenIDesc {
    isUsingGenTech: number;
}

addHandler(
    'GenI', // generative tech
    () => false,
    (reader, _target, left) => {
        const desc = readVersionAndDescriptor(reader) as GenIDesc;
        console.log('GenI', require('util').inspect(desc, false, 99, true));
    },
    (_writer, _target) => {
    },
);
*/
function readRect(reader) {
    var top = (0, psdReader_1.readInt32)(reader);
    var left = (0, psdReader_1.readInt32)(reader);
    var bottom = (0, psdReader_1.readInt32)(reader);
    var right = (0, psdReader_1.readInt32)(reader);
    return { top: top, left: left, bottom: bottom, right: right };
}
function writeRect(writer, rect) {
    (0, psdWriter_1.writeInt32)(writer, rect.top);
    (0, psdWriter_1.writeInt32)(writer, rect.left);
    (0, psdWriter_1.writeInt32)(writer, rect.bottom);
    (0, psdWriter_1.writeInt32)(writer, rect.right);
}
addHandler('Anno', function (target) { return target.annotations !== undefined; }, function (reader, target, left) {
    var major = (0, psdReader_1.readUint16)(reader);
    var minor = (0, psdReader_1.readUint16)(reader);
    if (major !== 2 || minor !== 1)
        throw new Error('Invalid Anno version');
    var count = (0, psdReader_1.readUint32)(reader);
    var annotations = [];
    for (var i = 0; i < count; i++) {
        /*const length =*/ (0, psdReader_1.readUint32)(reader);
        var type = (0, psdReader_1.readSignature)(reader);
        var open_1 = !!(0, psdReader_1.readUint8)(reader);
        /*const flags =*/ (0, psdReader_1.readUint8)(reader); // always 28
        /*const optionalBlocks =*/ (0, psdReader_1.readUint16)(reader);
        var iconLocation = readRect(reader);
        var popupLocation = readRect(reader);
        var color = (0, psdReader_1.readColor)(reader);
        var author = (0, psdReader_1.readPascalString)(reader, 2);
        var name_2 = (0, psdReader_1.readPascalString)(reader, 2);
        var date = (0, psdReader_1.readPascalString)(reader, 2);
        /*const contentLength =*/ (0, psdReader_1.readUint32)(reader);
        /*const dataType =*/ (0, psdReader_1.readSignature)(reader);
        var dataLength = (0, psdReader_1.readUint32)(reader);
        var data = void 0;
        if (type === 'txtA') {
            if (dataLength >= 2 && (0, psdReader_1.readUint16)(reader) === 0xfeff) {
                data = (0, psdReader_1.readUnicodeStringWithLength)(reader, (dataLength - 2) / 2);
            }
            else {
                reader.offset -= 2;
                data = (0, psdReader_1.readAsciiString)(reader, dataLength);
            }
            data = data.replace(/\r/g, '\n');
        }
        else if (type === 'sndA') {
            data = (0, psdReader_1.readBytes)(reader, dataLength);
        }
        else {
            throw new Error('Unknown annotation type');
        }
        annotations.push({
            type: type === 'txtA' ? 'text' : 'sound',
            open: open_1,
            iconLocation: iconLocation,
            popupLocation: popupLocation,
            color: color,
            author: author,
            name: name_2,
            date: date,
            data: data,
        });
    }
    target.annotations = annotations;
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var annotations = target.annotations;
    (0, psdWriter_1.writeUint16)(writer, 2);
    (0, psdWriter_1.writeUint16)(writer, 1);
    (0, psdWriter_1.writeUint32)(writer, annotations.length);
    for (var _i = 0, annotations_1 = annotations; _i < annotations_1.length; _i++) {
        var annotation = annotations_1[_i];
        var sound = annotation.type === 'sound';
        if (sound && !(annotation.data instanceof Uint8Array))
            throw new Error('Sound annotation data should be Uint8Array');
        if (!sound && typeof annotation.data !== 'string')
            throw new Error('Text annotation data should be string');
        var lengthOffset = writer.offset;
        (0, psdWriter_1.writeUint32)(writer, 0); // length
        (0, psdWriter_1.writeSignature)(writer, sound ? 'sndA' : 'txtA');
        (0, psdWriter_1.writeUint8)(writer, annotation.open ? 1 : 0);
        (0, psdWriter_1.writeUint8)(writer, 28);
        (0, psdWriter_1.writeUint16)(writer, 1);
        writeRect(writer, annotation.iconLocation);
        writeRect(writer, annotation.popupLocation);
        (0, psdWriter_1.writeColor)(writer, annotation.color);
        (0, psdWriter_1.writePascalString)(writer, annotation.author || '', 2);
        (0, psdWriter_1.writePascalString)(writer, annotation.name || '', 2);
        (0, psdWriter_1.writePascalString)(writer, annotation.date || '', 2);
        var contentOffset = writer.offset;
        (0, psdWriter_1.writeUint32)(writer, 0); // content length
        (0, psdWriter_1.writeSignature)(writer, sound ? 'sndM' : 'txtC');
        (0, psdWriter_1.writeUint32)(writer, 0); // data length
        var dataOffset = writer.offset;
        if (sound) {
            (0, psdWriter_1.writeBytes)(writer, annotation.data);
        }
        else {
            (0, psdWriter_1.writeUint16)(writer, 0xfeff); // unicode string indicator
            var text = annotation.data.replace(/\n/g, '\r');
            for (var i = 0; i < text.length; i++)
                (0, psdWriter_1.writeUint16)(writer, text.charCodeAt(i));
        }
        writer.view.setUint32(lengthOffset, writer.offset - lengthOffset, false);
        writer.view.setUint32(contentOffset, writer.offset - contentOffset, false);
        writer.view.setUint32(dataOffset - 4, writer.offset - dataOffset, false);
    }
});
addHandler('lnk2', function (target) { return !!target.linkedFiles && target.linkedFiles.length > 0; }, function (reader, target, left, _, options) {
    var psd = target;
    psd.linkedFiles = psd.linkedFiles || [];
    while (left() > 8) {
        var size = readLength64(reader); // size
        var startOffset = reader.offset;
        var type = (0, psdReader_1.readSignature)(reader);
        // liFD - linked file data
        // liFE - linked file external
        // liFA - linked file alias
        var version = (0, psdReader_1.readInt32)(reader);
        var id = (0, psdReader_1.readPascalString)(reader, 1);
        var name_3 = (0, psdReader_1.readUnicodeString)(reader);
        var fileType = (0, psdReader_1.readSignature)(reader).trim(); // '    ' if empty
        var fileCreator = (0, psdReader_1.readSignature)(reader).trim(); // '    ' or '\0\0\0\0' if empty
        var dataSize = readLength64(reader);
        var hasFileOpenDescriptor = (0, psdReader_1.readUint8)(reader);
        var fileOpenDescriptor = hasFileOpenDescriptor ? (0, descriptor_1.readVersionAndDescriptor)(reader) : undefined;
        var linkedFileDescriptor = type === 'liFE' ? (0, descriptor_1.readVersionAndDescriptor)(reader) : undefined;
        var file = { id: id, name: name_3 };
        if (fileType)
            file.type = fileType;
        if (fileCreator)
            file.creator = fileCreator;
        if (fileOpenDescriptor) {
            file.descriptor = {
                compInfo: {
                    compID: fileOpenDescriptor.compInfo.compID,
                    originalCompID: fileOpenDescriptor.compInfo.originalCompID,
                }
            };
        }
        if (type === 'liFE' && version > 3) {
            var year = (0, psdReader_1.readInt32)(reader);
            var month = (0, psdReader_1.readUint8)(reader);
            var day = (0, psdReader_1.readUint8)(reader);
            var hour = (0, psdReader_1.readUint8)(reader);
            var minute = (0, psdReader_1.readUint8)(reader);
            var seconds = (0, psdReader_1.readFloat64)(reader);
            var wholeSeconds = Math.floor(seconds);
            var ms = (seconds - wholeSeconds) * 1000;
            file.time = (new Date(year, month, day, hour, minute, wholeSeconds, ms)).toISOString();
        }
        var fileSize = type === 'liFE' ? readLength64(reader) : 0;
        if (type === 'liFA')
            (0, psdReader_1.skipBytes)(reader, 8);
        if (type === 'liFD')
            file.data = (0, psdReader_1.readBytes)(reader, dataSize); // seems to be a typo in docs
        if (version >= 5)
            file.childDocumentID = (0, psdReader_1.readUnicodeString)(reader);
        if (version >= 6)
            file.assetModTime = (0, psdReader_1.readFloat64)(reader);
        if (version >= 7)
            file.assetLockedState = (0, psdReader_1.readUint8)(reader);
        if (type === 'liFE' && version === 2)
            file.data = (0, psdReader_1.readBytes)(reader, fileSize);
        if (options.skipLinkedFilesData)
            file.data = undefined;
        psd.linkedFiles.push(file);
        linkedFileDescriptor;
        while (size % 4)
            size++;
        reader.offset = startOffset + size;
    }
    (0, psdReader_1.skipBytes)(reader, left()); // ?
}, function (writer, target) {
    var psd = target;
    for (var _i = 0, _a = psd.linkedFiles; _i < _a.length; _i++) {
        var file = _a[_i];
        var version = 2;
        if (file.assetLockedState != null)
            version = 7;
        else if (file.assetModTime != null)
            version = 6;
        else if (file.childDocumentID != null)
            version = 5;
        // TODO: else if (file.time != null) version = 3; (only for liFE)
        (0, psdWriter_1.writeUint32)(writer, 0);
        (0, psdWriter_1.writeUint32)(writer, 0); // size
        var sizeOffset = writer.offset;
        (0, psdWriter_1.writeSignature)(writer, file.data ? 'liFD' : 'liFA');
        (0, psdWriter_1.writeInt32)(writer, version);
        if (!file.id || typeof file.id !== 'string' || !/^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(file.id)) {
            throw new Error('Linked file ID must be in a GUID format (example: 20953ddb-9391-11ec-b4f1-c15674f50bc4)');
        }
        (0, psdWriter_1.writePascalString)(writer, file.id, 1);
        (0, psdWriter_1.writeUnicodeStringWithPadding)(writer, file.name || '');
        (0, psdWriter_1.writeSignature)(writer, file.type ? "".concat(file.type, "    ").substring(0, 4) : '    ');
        (0, psdWriter_1.writeSignature)(writer, file.creator ? "".concat(file.creator, "    ").substring(0, 4) : '\0\0\0\0');
        writeLength64(writer, file.data ? file.data.byteLength : 0);
        if (file.descriptor && file.descriptor.compInfo) {
            var desc = {
                compInfo: {
                    compID: file.descriptor.compInfo.compID,
                    originalCompID: file.descriptor.compInfo.originalCompID,
                }
            };
            (0, psdWriter_1.writeUint8)(writer, 1);
            (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc);
        }
        else {
            (0, psdWriter_1.writeUint8)(writer, 0);
        }
        if (file.data)
            (0, psdWriter_1.writeBytes)(writer, file.data);
        else
            writeLength64(writer, 0);
        if (version >= 5)
            (0, psdWriter_1.writeUnicodeStringWithPadding)(writer, file.childDocumentID || '');
        if (version >= 6)
            (0, psdWriter_1.writeFloat64)(writer, file.assetModTime || 0);
        if (version >= 7)
            (0, psdWriter_1.writeUint8)(writer, file.assetLockedState || 0);
        var size = writer.offset - sizeOffset;
        writer.view.setUint32(sizeOffset - 4, size, false); // write size
        while (size % 4) {
            size++;
            (0, psdWriter_1.writeUint8)(writer, 0);
        }
    }
});
addHandlerAlias('lnkD', 'lnk2');
addHandlerAlias('lnk3', 'lnk2');
addHandlerAlias('lnkE', 'lnk2');
addHandler('pths', hasKey('pathList'), function (reader, target) {
    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader, true);
    // console.log(require('util').inspect(desc, false, 99, true));
    // if (options.throwForMissingFeatures && desc?.pathList?.length) throw new Error('non-empty pathList in `pths`');
    desc;
    target.pathList = []; // TODO: read paths
}, function (writer, _target) {
    var desc = {
        pathList: [], // TODO: write paths
    };
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'pathsDataClass', desc);
});
addHandler('lyvr', hasKey('version'), function (reader, target) { return target.version = (0, psdReader_1.readUint32)(reader); }, function (writer, target) { return (0, psdWriter_1.writeUint32)(writer, target.version); });
function adjustmentType(type) {
    return function (target) { return !!target.adjustment && target.adjustment.type === type; };
}
addHandler('brit', adjustmentType('brightness/contrast'), function (reader, target, left) {
    if (!target.adjustment) { // ignore if got one from CgEd block
        target.adjustment = {
            type: 'brightness/contrast',
            brightness: (0, psdReader_1.readInt16)(reader),
            contrast: (0, psdReader_1.readInt16)(reader),
            meanValue: (0, psdReader_1.readInt16)(reader),
            labColorOnly: !!(0, psdReader_1.readUint8)(reader),
            useLegacy: true,
        };
    }
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var _a;
    var info = target.adjustment;
    (0, psdWriter_1.writeInt16)(writer, info.brightness || 0);
    (0, psdWriter_1.writeInt16)(writer, info.contrast || 0);
    (0, psdWriter_1.writeInt16)(writer, (_a = info.meanValue) !== null && _a !== void 0 ? _a : 127);
    (0, psdWriter_1.writeUint8)(writer, info.labColorOnly ? 1 : 0);
    (0, psdWriter_1.writeZeros)(writer, 1);
});
function readLevelsChannel(reader) {
    var shadowInput = (0, psdReader_1.readInt16)(reader);
    var highlightInput = (0, psdReader_1.readInt16)(reader);
    var shadowOutput = (0, psdReader_1.readInt16)(reader);
    var highlightOutput = (0, psdReader_1.readInt16)(reader);
    var midtoneInput = (0, psdReader_1.readInt16)(reader) / 100;
    return { shadowInput: shadowInput, highlightInput: highlightInput, shadowOutput: shadowOutput, highlightOutput: highlightOutput, midtoneInput: midtoneInput };
}
function writeLevelsChannel(writer, channel) {
    (0, psdWriter_1.writeInt16)(writer, channel.shadowInput);
    (0, psdWriter_1.writeInt16)(writer, channel.highlightInput);
    (0, psdWriter_1.writeInt16)(writer, channel.shadowOutput);
    (0, psdWriter_1.writeInt16)(writer, channel.highlightOutput);
    (0, psdWriter_1.writeInt16)(writer, Math.round(channel.midtoneInput * 100));
}
addHandler('levl', adjustmentType('levels'), function (reader, target, left) {
    if ((0, psdReader_1.readUint16)(reader) !== 2)
        throw new Error('Invalid levl version');
    target.adjustment = __assign(__assign({}, target.adjustment), { type: 'levels', rgb: readLevelsChannel(reader), red: readLevelsChannel(reader), green: readLevelsChannel(reader), blue: readLevelsChannel(reader) });
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var info = target.adjustment;
    var defaultChannel = {
        shadowInput: 0,
        highlightInput: 255,
        shadowOutput: 0,
        highlightOutput: 255,
        midtoneInput: 1,
    };
    (0, psdWriter_1.writeUint16)(writer, 2); // version
    writeLevelsChannel(writer, info.rgb || defaultChannel);
    writeLevelsChannel(writer, info.red || defaultChannel);
    writeLevelsChannel(writer, info.blue || defaultChannel);
    writeLevelsChannel(writer, info.green || defaultChannel);
    for (var i = 0; i < 59; i++)
        writeLevelsChannel(writer, defaultChannel);
});
function readCurveChannel(reader) {
    var nodes = (0, psdReader_1.readUint16)(reader);
    var channel = [];
    for (var j = 0; j < nodes; j++) {
        var output = (0, psdReader_1.readInt16)(reader);
        var input = (0, psdReader_1.readInt16)(reader);
        channel.push({ input: input, output: output });
    }
    return channel;
}
function writeCurveChannel(writer, channel) {
    (0, psdWriter_1.writeUint16)(writer, channel.length);
    for (var _i = 0, channel_1 = channel; _i < channel_1.length; _i++) {
        var n = channel_1[_i];
        (0, psdWriter_1.writeUint16)(writer, n.output);
        (0, psdWriter_1.writeUint16)(writer, n.input);
    }
}
addHandler('curv', adjustmentType('curves'), function (reader, target, left) {
    (0, psdReader_1.readUint8)(reader);
    if ((0, psdReader_1.readUint16)(reader) !== 1)
        throw new Error('Invalid curv version');
    (0, psdReader_1.readUint16)(reader);
    var channels = (0, psdReader_1.readUint16)(reader);
    var info = { type: 'curves' };
    if (channels & 1)
        info.rgb = readCurveChannel(reader);
    if (channels & 2)
        info.red = readCurveChannel(reader);
    if (channels & 4)
        info.green = readCurveChannel(reader);
    if (channels & 8)
        info.blue = readCurveChannel(reader);
    target.adjustment = __assign(__assign({}, target.adjustment), info);
    // ignoring, duplicate information
    // checkSignature(reader, 'Crv ');
    // const cVersion = readUint16(reader);
    // readUint16(reader);
    // const channelCount = readUint16(reader);
    // for (let i = 0; i < channelCount; i++) {
    // 	const index = readUint16(reader);
    // 	const nodes = readUint16(reader);
    // 	for (let j = 0; j < nodes; j++) {
    // 		const output = readInt16(reader);
    // 		const input = readInt16(reader);
    // 	}
    // }
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var info = target.adjustment;
    var rgb = info.rgb, red = info.red, green = info.green, blue = info.blue;
    var channels = 0;
    var channelCount = 0;
    if (rgb && rgb.length) {
        channels |= 1;
        channelCount++;
    }
    if (red && red.length) {
        channels |= 2;
        channelCount++;
    }
    if (green && green.length) {
        channels |= 4;
        channelCount++;
    }
    if (blue && blue.length) {
        channels |= 8;
        channelCount++;
    }
    (0, psdWriter_1.writeUint8)(writer, 0);
    (0, psdWriter_1.writeUint16)(writer, 1); // version
    (0, psdWriter_1.writeUint16)(writer, 0);
    (0, psdWriter_1.writeUint16)(writer, channels);
    if (rgb && rgb.length)
        writeCurveChannel(writer, rgb);
    if (red && red.length)
        writeCurveChannel(writer, red);
    if (green && green.length)
        writeCurveChannel(writer, green);
    if (blue && blue.length)
        writeCurveChannel(writer, blue);
    (0, psdWriter_1.writeSignature)(writer, 'Crv ');
    (0, psdWriter_1.writeUint16)(writer, 4); // version
    (0, psdWriter_1.writeUint16)(writer, 0);
    (0, psdWriter_1.writeUint16)(writer, channelCount);
    if (rgb && rgb.length) {
        (0, psdWriter_1.writeUint16)(writer, 0);
        writeCurveChannel(writer, rgb);
    }
    if (red && red.length) {
        (0, psdWriter_1.writeUint16)(writer, 1);
        writeCurveChannel(writer, red);
    }
    if (green && green.length) {
        (0, psdWriter_1.writeUint16)(writer, 2);
        writeCurveChannel(writer, green);
    }
    if (blue && blue.length) {
        (0, psdWriter_1.writeUint16)(writer, 3);
        writeCurveChannel(writer, blue);
    }
    (0, psdWriter_1.writeZeros)(writer, 2);
});
addHandler('expA', adjustmentType('exposure'), function (reader, target, left) {
    if ((0, psdReader_1.readUint16)(reader) !== 1)
        throw new Error('Invalid expA version');
    target.adjustment = __assign(__assign({}, target.adjustment), { type: 'exposure', exposure: (0, psdReader_1.readFloat32)(reader), offset: (0, psdReader_1.readFloat32)(reader), gamma: (0, psdReader_1.readFloat32)(reader) });
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var info = target.adjustment;
    (0, psdWriter_1.writeUint16)(writer, 1); // version
    (0, psdWriter_1.writeFloat32)(writer, info.exposure);
    (0, psdWriter_1.writeFloat32)(writer, info.offset);
    (0, psdWriter_1.writeFloat32)(writer, info.gamma);
    (0, psdWriter_1.writeZeros)(writer, 2);
});
addHandler('vibA', adjustmentType('vibrance'), function (reader, target, left) {
    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
    target.adjustment = { type: 'vibrance' };
    if (desc.vibrance !== undefined)
        target.adjustment.vibrance = desc.vibrance;
    if (desc.Strt !== undefined)
        target.adjustment.saturation = desc.Strt;
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var info = target.adjustment;
    var desc = {};
    if (info.vibrance !== undefined)
        desc.vibrance = info.vibrance;
    if (info.saturation !== undefined)
        desc.Strt = info.saturation;
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc);
});
function readHueChannel(reader) {
    return {
        a: (0, psdReader_1.readInt16)(reader),
        b: (0, psdReader_1.readInt16)(reader),
        c: (0, psdReader_1.readInt16)(reader),
        d: (0, psdReader_1.readInt16)(reader),
        hue: (0, psdReader_1.readInt16)(reader),
        saturation: (0, psdReader_1.readInt16)(reader),
        lightness: (0, psdReader_1.readInt16)(reader),
    };
}
function writeHueChannel(writer, channel) {
    var c = channel || {};
    (0, psdWriter_1.writeInt16)(writer, c.a || 0);
    (0, psdWriter_1.writeInt16)(writer, c.b || 0);
    (0, psdWriter_1.writeInt16)(writer, c.c || 0);
    (0, psdWriter_1.writeInt16)(writer, c.d || 0);
    (0, psdWriter_1.writeInt16)(writer, c.hue || 0);
    (0, psdWriter_1.writeInt16)(writer, c.saturation || 0);
    (0, psdWriter_1.writeInt16)(writer, c.lightness || 0);
}
addHandler('hue2', adjustmentType('hue/saturation'), function (reader, target, left) {
    if ((0, psdReader_1.readUint16)(reader) !== 2)
        throw new Error('Invalid hue2 version');
    target.adjustment = __assign(__assign({}, target.adjustment), { type: 'hue/saturation', master: readHueChannel(reader), reds: readHueChannel(reader), yellows: readHueChannel(reader), greens: readHueChannel(reader), cyans: readHueChannel(reader), blues: readHueChannel(reader), magentas: readHueChannel(reader) });
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var info = target.adjustment;
    (0, psdWriter_1.writeUint16)(writer, 2); // version
    writeHueChannel(writer, info.master);
    writeHueChannel(writer, info.reds);
    writeHueChannel(writer, info.yellows);
    writeHueChannel(writer, info.greens);
    writeHueChannel(writer, info.cyans);
    writeHueChannel(writer, info.blues);
    writeHueChannel(writer, info.magentas);
});
function readColorBalance(reader) {
    return {
        cyanRed: (0, psdReader_1.readInt16)(reader),
        magentaGreen: (0, psdReader_1.readInt16)(reader),
        yellowBlue: (0, psdReader_1.readInt16)(reader),
    };
}
function writeColorBalance(writer, value) {
    (0, psdWriter_1.writeInt16)(writer, value.cyanRed || 0);
    (0, psdWriter_1.writeInt16)(writer, value.magentaGreen || 0);
    (0, psdWriter_1.writeInt16)(writer, value.yellowBlue || 0);
}
addHandler('blnc', adjustmentType('color balance'), function (reader, target, left) {
    target.adjustment = {
        type: 'color balance',
        shadows: readColorBalance(reader),
        midtones: readColorBalance(reader),
        highlights: readColorBalance(reader),
        preserveLuminosity: !!(0, psdReader_1.readUint8)(reader),
    };
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var info = target.adjustment;
    writeColorBalance(writer, info.shadows || {});
    writeColorBalance(writer, info.midtones || {});
    writeColorBalance(writer, info.highlights || {});
    (0, psdWriter_1.writeUint8)(writer, info.preserveLuminosity ? 1 : 0);
    (0, psdWriter_1.writeZeros)(writer, 1);
});
addHandler('blwh', adjustmentType('black & white'), function (reader, target, left) {
    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
    target.adjustment = {
        type: 'black & white',
        reds: desc['Rd  '],
        yellows: desc.Yllw,
        greens: desc['Grn '],
        cyans: desc['Cyn '],
        blues: desc['Bl  '],
        magentas: desc.Mgnt,
        useTint: !!desc.useTint,
        presetKind: desc.bwPresetKind,
        presetFileName: desc.blackAndWhitePresetFileName,
    };
    if (desc.tintColor !== undefined)
        target.adjustment.tintColor = (0, descriptor_1.parseColor)(desc.tintColor);
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var info = target.adjustment;
    var desc = {
        'Rd  ': info.reds || 0,
        Yllw: info.yellows || 0,
        'Grn ': info.greens || 0,
        'Cyn ': info.cyans || 0,
        'Bl  ': info.blues || 0,
        Mgnt: info.magentas || 0,
        useTint: !!info.useTint,
        tintColor: (0, descriptor_1.serializeColor)(info.tintColor),
        bwPresetKind: info.presetKind || 0,
        blackAndWhitePresetFileName: info.presetFileName || '',
    };
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc);
});
addHandler('phfl', adjustmentType('photo filter'), function (reader, target, left) {
    var version = (0, psdReader_1.readUint16)(reader);
    if (version !== 2 && version !== 3)
        throw new Error('Invalid phfl version');
    var color;
    if (version === 2) {
        color = (0, psdReader_1.readColor)(reader);
    }
    else { // version 3
        // TODO: test this, this is probably wrong
        color = {
            l: (0, psdReader_1.readInt32)(reader) / 100,
            a: (0, psdReader_1.readInt32)(reader) / 100,
            b: (0, psdReader_1.readInt32)(reader) / 100,
        };
    }
    target.adjustment = {
        type: 'photo filter',
        color: color,
        density: (0, psdReader_1.readUint32)(reader) / 100,
        preserveLuminosity: !!(0, psdReader_1.readUint8)(reader),
    };
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var info = target.adjustment;
    (0, psdWriter_1.writeUint16)(writer, 2); // version
    (0, psdWriter_1.writeColor)(writer, info.color || { l: 0, a: 0, b: 0 });
    (0, psdWriter_1.writeUint32)(writer, (info.density || 0) * 100);
    (0, psdWriter_1.writeUint8)(writer, info.preserveLuminosity ? 1 : 0);
    (0, psdWriter_1.writeZeros)(writer, 3);
});
function readMixrChannel(reader) {
    var red = (0, psdReader_1.readInt16)(reader);
    var green = (0, psdReader_1.readInt16)(reader);
    var blue = (0, psdReader_1.readInt16)(reader);
    (0, psdReader_1.skipBytes)(reader, 2);
    var constant = (0, psdReader_1.readInt16)(reader);
    return { red: red, green: green, blue: blue, constant: constant };
}
function writeMixrChannel(writer, channel) {
    var c = channel || {};
    (0, psdWriter_1.writeInt16)(writer, c.red);
    (0, psdWriter_1.writeInt16)(writer, c.green);
    (0, psdWriter_1.writeInt16)(writer, c.blue);
    (0, psdWriter_1.writeZeros)(writer, 2);
    (0, psdWriter_1.writeInt16)(writer, c.constant);
}
addHandler('mixr', adjustmentType('channel mixer'), function (reader, target, left) {
    if ((0, psdReader_1.readUint16)(reader) !== 1)
        throw new Error('Invalid mixr version');
    var adjustment = target.adjustment = __assign(__assign({}, target.adjustment), { type: 'channel mixer', monochrome: !!(0, psdReader_1.readUint16)(reader) });
    if (!adjustment.monochrome) {
        adjustment.red = readMixrChannel(reader);
        adjustment.green = readMixrChannel(reader);
        adjustment.blue = readMixrChannel(reader);
    }
    adjustment.gray = readMixrChannel(reader);
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var info = target.adjustment;
    (0, psdWriter_1.writeUint16)(writer, 1); // version
    (0, psdWriter_1.writeUint16)(writer, info.monochrome ? 1 : 0);
    if (info.monochrome) {
        writeMixrChannel(writer, info.gray);
        (0, psdWriter_1.writeZeros)(writer, 3 * 5 * 2);
    }
    else {
        writeMixrChannel(writer, info.red);
        writeMixrChannel(writer, info.green);
        writeMixrChannel(writer, info.blue);
        writeMixrChannel(writer, info.gray);
    }
});
var colorLookupType = (0, helpers_1.createEnum)('colorLookupType', '3DLUT', {
    '3dlut': '3DLUT',
    abstractProfile: 'abstractProfile',
    deviceLinkProfile: 'deviceLinkProfile',
});
var LUTFormatType = (0, helpers_1.createEnum)('LUTFormatType', 'look', {
    look: 'LUTFormatLOOK',
    cube: 'LUTFormatCUBE',
    '3dl': 'LUTFormat3DL',
});
var colorLookupOrder = (0, helpers_1.createEnum)('colorLookupOrder', 'rgb', {
    rgb: 'rgbOrder',
    bgr: 'bgrOrder',
});
addHandler('clrL', adjustmentType('color lookup'), function (reader, target, left) {
    if ((0, psdReader_1.readUint16)(reader) !== 1)
        throw new Error('Invalid clrL version');
    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
    target.adjustment = { type: 'color lookup' };
    var info = target.adjustment;
    if (desc.lookupType !== undefined)
        info.lookupType = colorLookupType.decode(desc.lookupType);
    if (desc['Nm  '] !== undefined)
        info.name = desc['Nm  '];
    if (desc.Dthr !== undefined)
        info.dither = desc.Dthr;
    if (desc.profile !== undefined)
        info.profile = desc.profile;
    if (desc.LUTFormat !== undefined)
        info.lutFormat = LUTFormatType.decode(desc.LUTFormat);
    if (desc.dataOrder !== undefined)
        info.dataOrder = colorLookupOrder.decode(desc.dataOrder);
    if (desc.tableOrder !== undefined)
        info.tableOrder = colorLookupOrder.decode(desc.tableOrder);
    if (desc.LUT3DFileData !== undefined)
        info.lut3DFileData = desc.LUT3DFileData;
    if (desc.LUT3DFileName !== undefined)
        info.lut3DFileName = desc.LUT3DFileName;
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var info = target.adjustment;
    var desc = {};
    if (info.lookupType !== undefined)
        desc.lookupType = colorLookupType.encode(info.lookupType);
    if (info.name !== undefined)
        desc['Nm  '] = info.name;
    if (info.dither !== undefined)
        desc.Dthr = info.dither;
    if (info.profile !== undefined)
        desc.profile = info.profile;
    if (info.lutFormat !== undefined)
        desc.LUTFormat = LUTFormatType.encode(info.lutFormat);
    if (info.dataOrder !== undefined)
        desc.dataOrder = colorLookupOrder.encode(info.dataOrder);
    if (info.tableOrder !== undefined)
        desc.tableOrder = colorLookupOrder.encode(info.tableOrder);
    if (info.lut3DFileData !== undefined)
        desc.LUT3DFileData = info.lut3DFileData;
    if (info.lut3DFileName !== undefined)
        desc.LUT3DFileName = info.lut3DFileName;
    (0, psdWriter_1.writeUint16)(writer, 1); // version
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc);
});
addHandler('nvrt', adjustmentType('invert'), function (reader, target, left) {
    target.adjustment = { type: 'invert' };
    (0, psdReader_1.skipBytes)(reader, left());
}, function () {
    // nothing to write here
});
addHandler('post', adjustmentType('posterize'), function (reader, target, left) {
    target.adjustment = {
        type: 'posterize',
        levels: (0, psdReader_1.readUint16)(reader),
    };
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var _a;
    var info = target.adjustment;
    (0, psdWriter_1.writeUint16)(writer, (_a = info.levels) !== null && _a !== void 0 ? _a : 4);
    (0, psdWriter_1.writeZeros)(writer, 2);
});
addHandler('thrs', adjustmentType('threshold'), function (reader, target, left) {
    target.adjustment = {
        type: 'threshold',
        level: (0, psdReader_1.readUint16)(reader),
    };
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var _a;
    var info = target.adjustment;
    (0, psdWriter_1.writeUint16)(writer, (_a = info.level) !== null && _a !== void 0 ? _a : 128);
    (0, psdWriter_1.writeZeros)(writer, 2);
});
var grdmColorModels = ['', '', '', 'rgb', 'hsb', '', 'lab'];
addHandler('grdm', adjustmentType('gradient map'), function (reader, target, left) {
    if ((0, psdReader_1.readUint16)(reader) !== 1)
        throw new Error('Invalid grdm version');
    var info = {
        type: 'gradient map',
        gradientType: 'solid',
    };
    info.reverse = !!(0, psdReader_1.readUint8)(reader);
    info.dither = !!(0, psdReader_1.readUint8)(reader);
    info.name = (0, psdReader_1.readUnicodeString)(reader);
    info.colorStops = [];
    info.opacityStops = [];
    var stopsCount = (0, psdReader_1.readUint16)(reader);
    for (var i = 0; i < stopsCount; i++) {
        info.colorStops.push({
            location: (0, psdReader_1.readUint32)(reader),
            midpoint: (0, psdReader_1.readUint32)(reader) / 100,
            color: (0, psdReader_1.readColor)(reader),
        });
        (0, psdReader_1.skipBytes)(reader, 2);
    }
    var opacityStopsCount = (0, psdReader_1.readUint16)(reader);
    for (var i = 0; i < opacityStopsCount; i++) {
        info.opacityStops.push({
            location: (0, psdReader_1.readUint32)(reader),
            midpoint: (0, psdReader_1.readUint32)(reader) / 100,
            opacity: (0, psdReader_1.readUint16)(reader) / 0xff,
        });
    }
    var expansionCount = (0, psdReader_1.readUint16)(reader);
    if (expansionCount !== 2)
        throw new Error('Invalid grdm expansion count');
    var interpolation = (0, psdReader_1.readUint16)(reader);
    info.smoothness = interpolation / 4096;
    var length = (0, psdReader_1.readUint16)(reader);
    if (length !== 32)
        throw new Error('Invalid grdm length');
    info.gradientType = (0, psdReader_1.readUint16)(reader) ? 'noise' : 'solid';
    info.randomSeed = (0, psdReader_1.readUint32)(reader);
    info.addTransparency = !!(0, psdReader_1.readUint16)(reader);
    info.restrictColors = !!(0, psdReader_1.readUint16)(reader);
    info.roughness = (0, psdReader_1.readUint32)(reader) / 4096;
    info.colorModel = (grdmColorModels[(0, psdReader_1.readUint16)(reader)] || 'rgb');
    info.min = [
        (0, psdReader_1.readUint16)(reader) / 0x8000,
        (0, psdReader_1.readUint16)(reader) / 0x8000,
        (0, psdReader_1.readUint16)(reader) / 0x8000,
        (0, psdReader_1.readUint16)(reader) / 0x8000,
    ];
    info.max = [
        (0, psdReader_1.readUint16)(reader) / 0x8000,
        (0, psdReader_1.readUint16)(reader) / 0x8000,
        (0, psdReader_1.readUint16)(reader) / 0x8000,
        (0, psdReader_1.readUint16)(reader) / 0x8000,
    ];
    (0, psdReader_1.skipBytes)(reader, left());
    for (var _i = 0, _a = info.colorStops; _i < _a.length; _i++) {
        var s = _a[_i];
        s.location /= interpolation;
    }
    for (var _b = 0, _c = info.opacityStops; _b < _c.length; _b++) {
        var s = _c[_b];
        s.location /= interpolation;
    }
    target.adjustment = info;
}, function (writer, target) {
    var _a, _b, _c;
    var info = target.adjustment;
    (0, psdWriter_1.writeUint16)(writer, 1); // version
    (0, psdWriter_1.writeUint8)(writer, info.reverse ? 1 : 0);
    (0, psdWriter_1.writeUint8)(writer, info.dither ? 1 : 0);
    (0, psdWriter_1.writeUnicodeStringWithPadding)(writer, info.name || '');
    (0, psdWriter_1.writeUint16)(writer, info.colorStops && info.colorStops.length || 0);
    var interpolation = Math.round(((_a = info.smoothness) !== null && _a !== void 0 ? _a : 1) * 4096);
    for (var _i = 0, _d = info.colorStops || []; _i < _d.length; _i++) {
        var s = _d[_i];
        (0, psdWriter_1.writeUint32)(writer, Math.round(s.location * interpolation));
        (0, psdWriter_1.writeUint32)(writer, Math.round(s.midpoint * 100));
        (0, psdWriter_1.writeColor)(writer, s.color);
        (0, psdWriter_1.writeZeros)(writer, 2);
    }
    (0, psdWriter_1.writeUint16)(writer, info.opacityStops && info.opacityStops.length || 0);
    for (var _e = 0, _f = info.opacityStops || []; _e < _f.length; _e++) {
        var s = _f[_e];
        (0, psdWriter_1.writeUint32)(writer, Math.round(s.location * interpolation));
        (0, psdWriter_1.writeUint32)(writer, Math.round(s.midpoint * 100));
        (0, psdWriter_1.writeUint16)(writer, Math.round(s.opacity * 0xff));
    }
    (0, psdWriter_1.writeUint16)(writer, 2); // expansion count
    (0, psdWriter_1.writeUint16)(writer, interpolation);
    (0, psdWriter_1.writeUint16)(writer, 32); // length
    (0, psdWriter_1.writeUint16)(writer, info.gradientType === 'noise' ? 1 : 0);
    (0, psdWriter_1.writeUint32)(writer, info.randomSeed || 0);
    (0, psdWriter_1.writeUint16)(writer, info.addTransparency ? 1 : 0);
    (0, psdWriter_1.writeUint16)(writer, info.restrictColors ? 1 : 0);
    (0, psdWriter_1.writeUint32)(writer, Math.round(((_b = info.roughness) !== null && _b !== void 0 ? _b : 1) * 4096));
    var colorModel = grdmColorModels.indexOf((_c = info.colorModel) !== null && _c !== void 0 ? _c : 'rgb');
    (0, psdWriter_1.writeUint16)(writer, colorModel === -1 ? 3 : colorModel);
    for (var i = 0; i < 4; i++)
        (0, psdWriter_1.writeUint16)(writer, Math.round((info.min && info.min[i] || 0) * 0x8000));
    for (var i = 0; i < 4; i++)
        (0, psdWriter_1.writeUint16)(writer, Math.round((info.max && info.max[i] || 0) * 0x8000));
    (0, psdWriter_1.writeZeros)(writer, 4);
});
function readSelectiveColors(reader) {
    return {
        c: (0, psdReader_1.readInt16)(reader),
        m: (0, psdReader_1.readInt16)(reader),
        y: (0, psdReader_1.readInt16)(reader),
        k: (0, psdReader_1.readInt16)(reader),
    };
}
function writeSelectiveColors(writer, cmyk) {
    var c = cmyk || {};
    (0, psdWriter_1.writeInt16)(writer, c.c);
    (0, psdWriter_1.writeInt16)(writer, c.m);
    (0, psdWriter_1.writeInt16)(writer, c.y);
    (0, psdWriter_1.writeInt16)(writer, c.k);
}
addHandler('selc', adjustmentType('selective color'), function (reader, target) {
    if ((0, psdReader_1.readUint16)(reader) !== 1)
        throw new Error('Invalid selc version');
    var mode = (0, psdReader_1.readUint16)(reader) ? 'absolute' : 'relative';
    (0, psdReader_1.skipBytes)(reader, 8);
    target.adjustment = {
        type: 'selective color',
        mode: mode,
        reds: readSelectiveColors(reader),
        yellows: readSelectiveColors(reader),
        greens: readSelectiveColors(reader),
        cyans: readSelectiveColors(reader),
        blues: readSelectiveColors(reader),
        magentas: readSelectiveColors(reader),
        whites: readSelectiveColors(reader),
        neutrals: readSelectiveColors(reader),
        blacks: readSelectiveColors(reader),
    };
}, function (writer, target) {
    var info = target.adjustment;
    (0, psdWriter_1.writeUint16)(writer, 1); // version
    (0, psdWriter_1.writeUint16)(writer, info.mode === 'absolute' ? 1 : 0);
    (0, psdWriter_1.writeZeros)(writer, 8);
    writeSelectiveColors(writer, info.reds);
    writeSelectiveColors(writer, info.yellows);
    writeSelectiveColors(writer, info.greens);
    writeSelectiveColors(writer, info.cyans);
    writeSelectiveColors(writer, info.blues);
    writeSelectiveColors(writer, info.magentas);
    writeSelectiveColors(writer, info.whites);
    writeSelectiveColors(writer, info.neutrals);
    writeSelectiveColors(writer, info.blacks);
});
addHandler('CgEd', function (target) {
    var a = target.adjustment;
    if (!a)
        return false;
    return (a.type === 'brightness/contrast' && !a.useLegacy) ||
        ((a.type === 'levels' || a.type === 'curves' || a.type === 'exposure' || a.type === 'channel mixer' ||
            a.type === 'hue/saturation') && a.presetFileName !== undefined);
}, function (reader, target, left) {
    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
    if (desc.Vrsn !== 1)
        throw new Error('Invalid CgEd version');
    // this section can specify preset file name for other adjustment types
    if ('presetFileName' in desc) {
        target.adjustment = __assign(__assign({}, target.adjustment), { presetKind: desc.presetKind, presetFileName: desc.presetFileName });
    }
    else if ('curvesPresetFileName' in desc) {
        target.adjustment = __assign(__assign({}, target.adjustment), { presetKind: desc.curvesPresetKind, presetFileName: desc.curvesPresetFileName });
    }
    else if ('mixerPresetFileName' in desc) {
        target.adjustment = __assign(__assign({}, target.adjustment), { presetKind: desc.mixerPresetKind, presetFileName: desc.mixerPresetFileName });
    }
    else {
        target.adjustment = {
            type: 'brightness/contrast',
            brightness: desc.Brgh,
            contrast: desc.Cntr,
            meanValue: desc.means,
            useLegacy: !!desc.useLegacy,
            labColorOnly: !!desc['Lab '],
            auto: !!desc.Auto,
        };
    }
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var _a, _b, _c, _d;
    var info = target.adjustment;
    if (info.type === 'levels' || info.type === 'exposure' || info.type === 'hue/saturation') {
        var desc = {
            Vrsn: 1,
            presetKind: (_a = info.presetKind) !== null && _a !== void 0 ? _a : 1,
            presetFileName: info.presetFileName || '',
        };
        (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc);
    }
    else if (info.type === 'curves') {
        var desc = {
            Vrsn: 1,
            curvesPresetKind: (_b = info.presetKind) !== null && _b !== void 0 ? _b : 1,
            curvesPresetFileName: info.presetFileName || '',
        };
        (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc);
    }
    else if (info.type === 'channel mixer') {
        var desc = {
            Vrsn: 1,
            mixerPresetKind: (_c = info.presetKind) !== null && _c !== void 0 ? _c : 1,
            mixerPresetFileName: info.presetFileName || '',
        };
        (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc);
    }
    else if (info.type === 'brightness/contrast') {
        var desc = {
            Vrsn: 1,
            Brgh: info.brightness || 0,
            Cntr: info.contrast || 0,
            means: (_d = info.meanValue) !== null && _d !== void 0 ? _d : 127,
            'Lab ': !!info.labColorOnly,
            useLegacy: !!info.useLegacy,
            Auto: !!info.auto,
        };
        (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc);
    }
    else {
        throw new Error('Unhandled CgEd case');
    }
});
addHandler('Txt2', hasKey('engineData'), function (reader, target, left) {
    var data = (0, psdReader_1.readBytes)(reader, left());
    target.engineData = (0, base64_js_1.fromByteArray)(data);
    // const engineData = parseEngineData(data);
    // const engineData2 = decodeEngineData2(engineData);
    // console.log(require('util').inspect(engineData, false, 99, true));
    // require('fs').writeFileSync('test_data.bin', data);
    // require('fs').writeFileSync('test_data.txt', require('util').inspect(engineData, false, 99, false), 'utf8');
    // require('fs').writeFileSync('test_data.json', JSON.stringify(engineData2, null, 2), 'utf8');
}, function (writer, target) {
    var buffer = (0, base64_js_1.toByteArray)(target.engineData);
    (0, psdWriter_1.writeBytes)(writer, buffer);
});
addHandler('FEid', hasKey('filterEffectsMasks'), function (reader, target, leftBytes) {
    var version = (0, psdReader_1.readInt32)(reader);
    if (version < 1 || version > 3)
        throw new Error("Invalid filterEffects version ".concat(version));
    if ((0, psdReader_1.readUint32)(reader))
        throw new Error('filterEffects: 64 bit length is not supported');
    var length = (0, psdReader_1.readUint32)(reader);
    var end = reader.offset + length;
    target.filterEffectsMasks = [];
    while (reader.offset < end) {
        var id = (0, psdReader_1.readPascalString)(reader, 1);
        var effectVersion = (0, psdReader_1.readInt32)(reader);
        if (effectVersion !== 1)
            throw new Error("Invalid filterEffect version ".concat(effectVersion));
        if ((0, psdReader_1.readUint32)(reader))
            throw new Error('filterEffect: 64 bit length is not supported');
        /*const effectLength =*/ (0, psdReader_1.readUint32)(reader);
        // const endOfEffect = reader.offset + effectLength;
        var top_2 = (0, psdReader_1.readInt32)(reader);
        var left = (0, psdReader_1.readInt32)(reader);
        var bottom = (0, psdReader_1.readInt32)(reader);
        var right = (0, psdReader_1.readInt32)(reader);
        var depth = (0, psdReader_1.readInt32)(reader);
        var maxChannels = (0, psdReader_1.readInt32)(reader);
        var channels = [];
        // 0 -> R, 1 -> G, 2 -> B, 25 -> A
        for (var i = 0; i < (maxChannels + 2); i++) {
            var exists = (0, psdReader_1.readInt32)(reader);
            if (exists) {
                if ((0, psdReader_1.readUint32)(reader))
                    throw new Error('filterEffect: 64 bit length is not supported');
                var channelLength = (0, psdReader_1.readUint32)(reader);
                var compressionMode = (0, psdReader_1.readUint16)(reader);
                var data = (0, psdReader_1.readBytes)(reader, channelLength - 2);
                channels.push({ compressionMode: compressionMode, data: data });
            }
            else {
                channels.push(undefined);
            }
        }
        target.filterEffectsMasks.push({ id: id, top: top_2, left: left, bottom: bottom, right: right, depth: depth, channels: channels });
        if (leftBytes() && (0, psdReader_1.readUint8)(reader)) {
            var compressionMode = (0, psdReader_1.readUint16)(reader);
            var data = (0, psdReader_1.readBytes)(reader, leftBytes());
            target.filterEffectsMasks[target.filterEffectsMasks.length - 1].extra = { compressionMode: compressionMode, data: data };
        }
    }
}, function (writer, target) {
    var _a;
    (0, psdWriter_1.writeInt32)(writer, 3);
    (0, psdWriter_1.writeUint32)(writer, 0);
    (0, psdWriter_1.writeUint32)(writer, 0);
    var lengthOffset = writer.offset;
    for (var _i = 0, _b = target.filterEffectsMasks; _i < _b.length; _i++) {
        var mask = _b[_i];
        (0, psdWriter_1.writePascalString)(writer, mask.id, 1);
        (0, psdWriter_1.writeInt32)(writer, 1);
        (0, psdWriter_1.writeUint32)(writer, 0);
        (0, psdWriter_1.writeUint32)(writer, 0);
        var length2Offset = writer.offset;
        (0, psdWriter_1.writeInt32)(writer, mask.top);
        (0, psdWriter_1.writeInt32)(writer, mask.left);
        (0, psdWriter_1.writeInt32)(writer, mask.bottom);
        (0, psdWriter_1.writeInt32)(writer, mask.right);
        (0, psdWriter_1.writeInt32)(writer, mask.depth);
        var maxChannels = Math.max(0, mask.channels.length - 2);
        (0, psdWriter_1.writeInt32)(writer, maxChannels);
        for (var i = 0; i < (maxChannels + 2); i++) {
            var channel = mask.channels[i];
            (0, psdWriter_1.writeInt32)(writer, channel ? 1 : 0);
            if (channel) {
                (0, psdWriter_1.writeUint32)(writer, 0);
                (0, psdWriter_1.writeUint32)(writer, channel.data.length + 2);
                (0, psdWriter_1.writeUint16)(writer, channel.compressionMode);
                (0, psdWriter_1.writeBytes)(writer, channel.data);
            }
        }
        writer.view.setUint32(length2Offset - 4, writer.offset - length2Offset, false);
    }
    var extra = (_a = target.filterEffectsMasks[target.filterEffectsMasks.length - 1]) === null || _a === void 0 ? void 0 : _a.extra;
    if (extra) {
        (0, psdWriter_1.writeUint8)(writer, 1);
        (0, psdWriter_1.writeUint16)(writer, extra.compressionMode);
        (0, psdWriter_1.writeBytes)(writer, extra.data);
    }
    writer.view.setUint32(lengthOffset - 4, writer.offset - lengthOffset, false);
});
addHandlerAlias('FXid', 'FEid');
addHandler('FMsk', hasKey('filterMask'), function (reader, target) {
    target.filterMask = {
        colorSpace: (0, psdReader_1.readColor)(reader),
        opacity: (0, psdReader_1.readUint16)(reader) / 0xff,
    };
}, function (writer, target) {
    var _a;
    (0, psdWriter_1.writeColor)(writer, target.filterMask.colorSpace);
    (0, psdWriter_1.writeUint16)(writer, (0, helpers_1.clamp)((_a = target.filterMask.opacity) !== null && _a !== void 0 ? _a : 1, 0, 1) * 0xff);
});
addHandler('artd', // document-wide artboard info
function (// document-wide artboard info
target) { return target.artboards !== undefined; }, function (reader, target, left) {
    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
    target.artboards = {
        count: desc['Cnt '],
        autoExpandOffset: { horizontal: desc.autoExpandOffset.Hrzn, vertical: desc.autoExpandOffset.Vrtc },
        origin: { horizontal: desc.origin.Hrzn, vertical: desc.origin.Vrtc },
        autoExpandEnabled: desc.autoExpandEnabled,
        autoNestEnabled: desc.autoNestEnabled,
        autoPositionEnabled: desc.autoPositionEnabled,
        shrinkwrapOnSaveEnabled: !!desc.shrinkwrapOnSaveEnabled,
        docDefaultNewArtboardBackgroundColor: (0, descriptor_1.parseColor)(desc.docDefaultNewArtboardBackgroundColor),
        docDefaultNewArtboardBackgroundType: desc.docDefaultNewArtboardBackgroundType,
    };
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var _a, _b, _c, _d, _e;
    var artb = target.artboards;
    var desc = {
        'Cnt ': artb.count,
        autoExpandOffset: artb.autoExpandOffset ? { Hrzn: artb.autoExpandOffset.horizontal, Vrtc: artb.autoExpandOffset.vertical } : { Hrzn: 0, Vrtc: 0 },
        origin: artb.origin ? { Hrzn: artb.origin.horizontal, Vrtc: artb.origin.vertical } : { Hrzn: 0, Vrtc: 0 },
        autoExpandEnabled: (_a = artb.autoExpandEnabled) !== null && _a !== void 0 ? _a : true,
        autoNestEnabled: (_b = artb.autoNestEnabled) !== null && _b !== void 0 ? _b : true,
        autoPositionEnabled: (_c = artb.autoPositionEnabled) !== null && _c !== void 0 ? _c : true,
        shrinkwrapOnSaveEnabled: (_d = artb.shrinkwrapOnSaveEnabled) !== null && _d !== void 0 ? _d : true,
        docDefaultNewArtboardBackgroundColor: (0, descriptor_1.serializeColor)(artb.docDefaultNewArtboardBackgroundColor),
        docDefaultNewArtboardBackgroundType: (_e = artb.docDefaultNewArtboardBackgroundType) !== null && _e !== void 0 ? _e : 1,
    };
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc, 'artd');
});
function hasMultiEffects(effects) {
    return Object.keys(effects).map(function (key) { return effects[key]; }).some(function (v) { return Array.isArray(v) && v.length > 1; });
}
exports.hasMultiEffects = hasMultiEffects;
addHandler('lfx2', function (target) { return target.effects !== undefined && !hasMultiEffects(target.effects); }, function (reader, target, left, _, options) {
    var version = (0, psdReader_1.readUint32)(reader);
    if (version !== 0)
        throw new Error("Invalid lfx2 version");
    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
    // console.log('READ', require('util').inspect(desc, false, 99, true));
    // TODO: don't discard if we got it from lmfx
    // discard if read in 'lrFX' section
    target.effects = (0, descriptor_1.parseEffects)(desc, !!options.logMissingFeatures);
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target, _, options) {
    var desc = (0, descriptor_1.serializeEffects)(target.effects, !!options.logMissingFeatures, true);
    // console.log('WRITE', require('util').inspect(desc, false, 99, true));
    (0, psdWriter_1.writeUint32)(writer, 0); // version
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc);
});
addHandler('cinf', hasKey('compositorUsed'), function (reader, target, left) {
    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
    // console.log(require('util').inspect(desc, false, 99, true));
    function enumValue(desc) {
        return desc.split('.')[1];
    }
    target.compositorUsed = {
        description: desc.description,
        reason: desc.reason,
        engine: enumValue(desc.Engn),
    };
    if (desc.enableCompCore)
        target.compositorUsed.enableCompCore = enumValue(desc.enableCompCore);
    if (desc.enableCompCoreGPU)
        target.compositorUsed.enableCompCoreGPU = enumValue(desc.enableCompCoreGPU);
    if (desc.compCoreSupport)
        target.compositorUsed.compCoreSupport = enumValue(desc.compCoreSupport);
    if (desc.compCoreGPUSupport)
        target.compositorUsed.compCoreGPUSupport = enumValue(desc.compCoreGPUSupport);
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var cinf = target.compositorUsed;
    var desc = {
        Vrsn: { major: 1, minor: 0, fix: 0 },
        // psVersion: { major: 22, minor: 3, fix: 1 }, // TESTING
        description: cinf.description,
        reason: cinf.reason,
        Engn: "Engn.".concat(cinf.engine),
    };
    if (cinf.enableCompCore)
        desc.enableCompCore = "enable.".concat(cinf.enableCompCore);
    if (cinf.enableCompCoreGPU)
        desc.enableCompCoreGPU = "enable.".concat(cinf.enableCompCoreGPU);
    // desc.enableCompCoreThreads = `enable.feature`; // TESTING
    if (cinf.compCoreSupport)
        desc.compCoreSupport = "reason.".concat(cinf.compCoreSupport);
    if (cinf.compCoreGPUSupport)
        desc.compCoreGPUSupport = "reason.".concat(cinf.compCoreGPUSupport);
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc);
});
// extension settings ?, ignore it
addHandler('extn', function (target) { return target._extn !== undefined; }, function (reader, target) {
    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
    // console.log(require('util').inspect(desc, false, 99, true));
    if (helpers_1.MOCK_HANDLERS)
        target._extn = desc;
}, function (writer, target) {
    // TODO: need to add correct types for desc fields (resources/src.psd)
    if (helpers_1.MOCK_HANDLERS)
        (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', target._extn);
});
addHandler('iOpa', hasKey('fillOpacity'), function (reader, target) {
    target.fillOpacity = (0, psdReader_1.readUint8)(reader) / 0xff;
    (0, psdReader_1.skipBytes)(reader, 3);
}, function (writer, target) {
    (0, psdWriter_1.writeUint8)(writer, target.fillOpacity * 0xff);
    (0, psdWriter_1.writeZeros)(writer, 3);
});
addHandler('brst', hasKey('channelBlendingRestrictions'), function (reader, target, left) {
    target.channelBlendingRestrictions = [];
    while (left() > 4) {
        target.channelBlendingRestrictions.push((0, psdReader_1.readInt32)(reader));
    }
}, function (writer, target) {
    for (var _i = 0, _a = target.channelBlendingRestrictions; _i < _a.length; _i++) {
        var channel = _a[_i];
        (0, psdWriter_1.writeInt32)(writer, channel);
    }
});
addHandler('tsly', hasKey('transparencyShapesLayer'), function (reader, target) {
    target.transparencyShapesLayer = !!(0, psdReader_1.readUint8)(reader);
    (0, psdReader_1.skipBytes)(reader, 3);
}, function (writer, target) {
    (0, psdWriter_1.writeUint8)(writer, target.transparencyShapesLayer ? 1 : 0);
    (0, psdWriter_1.writeZeros)(writer, 3);
});

},{"./descriptor":4,"./effectsHelpers":5,"./engineData":6,"./helpers":7,"./psdReader":11,"./psdWriter":12,"./text":13,"base64-js":21}],3:[function(require,module,exports){
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readCsh = void 0;
var additionalInfo_1 = require("./additionalInfo");
var psdReader_1 = require("./psdReader");
function readCsh(buffer) {
    var reader = (0, psdReader_1.createReader)(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    var csh = { shapes: [] };
    (0, psdReader_1.checkSignature)(reader, 'cush');
    if ((0, psdReader_1.readUint32)(reader) !== 2)
        throw new Error('Invalid version');
    var count = (0, psdReader_1.readUint32)(reader);
    for (var i = 0; i < count; i++) {
        var name_1 = (0, psdReader_1.readUnicodeString)(reader);
        while (reader.offset % 4)
            reader.offset++; // pad to 4byte bounds
        if ((0, psdReader_1.readUint32)(reader) !== 1)
            throw new Error('Invalid shape version');
        var size = (0, psdReader_1.readUint32)(reader);
        var end = reader.offset + size;
        var id = (0, psdReader_1.readPascalString)(reader, 1);
        // this might not be correct ???
        var y1 = (0, psdReader_1.readUint32)(reader);
        var x1 = (0, psdReader_1.readUint32)(reader);
        var y2 = (0, psdReader_1.readUint32)(reader);
        var x2 = (0, psdReader_1.readUint32)(reader);
        var width = x2 - x1;
        var height = y2 - y1;
        var mask = { paths: [] };
        (0, additionalInfo_1.readVectorMask)(reader, mask, width, height, end - reader.offset);
        csh.shapes.push(__assign({ name: name_1, id: id, width: width, height: height }, mask));
        reader.offset = end;
    }
    return csh;
}
exports.readCsh = readCsh;

},{"./additionalInfo":2,"./psdReader":11}],4:[function(require,module,exports){
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ESliceOrigin = exports.ESliceVertAlign = exports.ESliceHorzAlign = exports.ESliceType = exports.FrFl = exports.FStl = exports.ClrS = exports.gradientInterpolationMethodType = exports.stdTrackID = exports.animInterpStyleEnum = exports.GrdT = exports.IGSr = exports.BETE = exports.BESs = exports.bvlT = exports.BESl = exports.BlnM = exports.warpStyle = exports.Annt = exports.Ornt = exports.textGridding = exports.frac = exports.unitsValue = exports.unitsPercentF = exports.unitsPercent = exports.unitsAngle = exports.parseUnitsToNumber = exports.parseUnitsOrNumber = exports.parseUnits = exports.parsePercentOrAngle = exports.parsePercent = exports.parseAngle = exports.serializeColor = exports.parseColor = exports.serializeVectorContent = exports.parseVectorContent = exports.serializeTrackList = exports.parseTrackList = exports.parseEffects = exports.serializeEffects = exports.boundsToDescBounds = exports.descBoundsToBounds = exports.xyToHorzVrtc = exports.horzVrtcToXY = exports.writeVersionAndDescriptor = exports.readVersionAndDescriptor = exports.writeDescriptorStructure = exports.readDescriptorStructure = exports.readAsciiStringOrClassId = exports.setLogErrors = void 0;
exports.prjM = exports.FlMd = exports.IntC = exports.IntE = exports.Drct = exports.WndM = exports.CntE = exports.FlCl = exports.ExtR = exports.ExtT = exports.DfsM = exports.blurType = exports.Lns = exports.MztT = exports.Chnl = exports.Dstr = exports.ZZTy = exports.Wvtp = exports.SphM = exports.RplS = exports.Cnvr = exports.UndA = exports.DspM = exports.SmBQ = exports.SmBM = exports.BlrQ = exports.BlrM = exports.strokeStyleLineAlignment = exports.strokeStyleLineJoinType = exports.strokeStyleLineCapType = exports.ESliceBGColorType = void 0;
var helpers_1 = require("./helpers");
var psdReader_1 = require("./psdReader");
var psdWriter_1 = require("./psdWriter");
function revMap(map) {
    var result = {};
    Object.keys(map).forEach(function (key) { return result[map[key]] = key; });
    return result;
}
var unitsMap = {
    '#Ang': 'Angle',
    '#Rsl': 'Density',
    '#Rlt': 'Distance',
    '#Nne': 'None',
    '#Prc': 'Percent',
    '#Pxl': 'Pixels',
    '#Mlm': 'Millimeters',
    '#Pnt': 'Points',
    'RrPi': 'Picas',
    'RrIn': 'Inches',
    'RrCm': 'Centimeters',
};
var unitsMapRev = revMap(unitsMap);
var logErrors = false;
function setLogErrors(value) {
    logErrors = value;
}
exports.setLogErrors = setLogErrors;
function makeType(name, classID) {
    return { name: name, classID: classID };
}
var nullType = makeType('', 'null');
var fieldToExtType = {
    strokeStyleContent: makeType('', 'solidColorLayer'),
    // printProofSetup: makeType('校样设置', 'proofSetup'), // TESTING
    printProofSetup: makeType('Proof Setup', 'proofSetup'),
    patternFill: makeType('', 'patternFill'),
    Grad: makeType('Gradient', 'Grdn'),
    ebbl: makeType('', 'ebbl'),
    SoFi: makeType('', 'SoFi'),
    GrFl: makeType('', 'GrFl'),
    sdwC: makeType('', 'RGBC'),
    hglC: makeType('', 'RGBC'),
    'Clr ': makeType('', 'RGBC'),
    'tintColor': makeType('', 'RGBC'),
    Ofst: makeType('', 'Pnt '),
    ChFX: makeType('', 'ChFX'),
    MpgS: makeType('', 'ShpC'),
    DrSh: makeType('', 'DrSh'),
    IrSh: makeType('', 'IrSh'),
    OrGl: makeType('', 'OrGl'),
    IrGl: makeType('', 'IrGl'),
    TrnS: makeType('', 'ShpC'),
    Ptrn: makeType('', 'Ptrn'),
    FrFX: makeType('', 'FrFX'),
    phase: makeType('', 'Pnt '),
    frameStep: nullType,
    duration: nullType,
    workInTime: nullType,
    workOutTime: nullType,
    audioClipGroupList: nullType,
    bounds: makeType('', 'Rctn'),
    customEnvelopeWarp: makeType('', 'customEnvelopeWarp'),
    warp: makeType('', 'warp'),
    'Sz  ': makeType('', 'Pnt '),
    origin: makeType('', 'Pnt '),
    autoExpandOffset: makeType('', 'Pnt '),
    keyOriginShapeBBox: makeType('', 'unitRect'),
    Vrsn: nullType,
    psVersion: nullType,
    docDefaultNewArtboardBackgroundColor: makeType('', 'RGBC'),
    artboardRect: makeType('', 'classFloatRect'),
    keyOriginRRectRadii: makeType('', 'radii'),
    keyOriginBoxCorners: nullType,
    rectangleCornerA: makeType('', 'Pnt '),
    rectangleCornerB: makeType('', 'Pnt '),
    rectangleCornerC: makeType('', 'Pnt '),
    rectangleCornerD: makeType('', 'Pnt '),
    compInfo: nullType,
    Trnf: makeType('Transform', 'Trnf'),
    quiltWarp: makeType('', 'quiltWarp'),
    generatorSettings: nullType,
    crema: nullType,
    FrIn: nullType,
    blendOptions: nullType,
    FXRf: nullType,
    Lefx: nullType,
    time: nullType,
    animKey: nullType,
    timeScope: nullType,
    inTime: nullType,
    outTime: nullType,
    sheetStyle: nullType,
    translation: nullType,
    Skew: nullType,
    boundingBox: makeType('', 'boundingBox'),
    'Lnk ': makeType('', 'ExternalFileLink'),
    frameReader: makeType('', 'FrameReader'),
    effectParams: makeType('', 'motionTrackEffectParams'),
    Impr: makeType('None', 'none'),
    Anch: makeType('', 'Pnt '),
    'Fwd ': makeType('', 'Pnt '),
    'Bwd ': makeType('', 'Pnt '),
    FlrC: makeType('', 'Pnt '),
    meshBoundaryPath: makeType('', 'pathClass'),
    filterFX: makeType('', 'filterFXStyle'),
    Fltr: makeType('', 'rigidTransform'),
    FrgC: makeType('', 'RGBC'),
    BckC: makeType('', 'RGBC'),
    sdwM: makeType('Parameters', 'adaptCorrectTones'),
    hglM: makeType('Parameters', 'adaptCorrectTones'),
    customShape: makeType('', 'customShape'),
    origFXRefPoint: nullType,
    FXRefPoint: nullType,
};
var fieldToArrayExtType = {
    'Crv ': makeType('', 'CrPt'),
    Clrs: makeType('', 'Clrt'),
    Trns: makeType('', 'TrnS'),
    keyDescriptorList: nullType,
    solidFillMulti: makeType('', 'SoFi'),
    gradientFillMulti: makeType('', 'GrFl'),
    dropShadowMulti: makeType('', 'DrSh'),
    innerShadowMulti: makeType('', 'IrSh'),
    frameFXMulti: makeType('', 'FrFX'),
    FrIn: nullType,
    FSts: nullType,
    LaSt: nullType,
    sheetTimelineOptions: nullType,
    trackList: makeType('', 'animationTrack'),
    globalTrackList: makeType('', 'animationTrack'),
    keyList: nullType,
    audioClipGroupList: nullType,
    audioClipList: nullType,
    countObjectList: makeType('', 'countObject'),
    countGroupList: makeType('', 'countGroup'),
    slices: makeType('', 'slice'),
    'Pts ': makeType('', 'Pthp'),
    SbpL: makeType('', 'SbpL'),
    pathComponents: makeType('', 'PaCm'),
    filterFXList: makeType('', 'filterFX'),
    puppetShapeList: makeType('', 'puppetShape'),
    channelDenoise: makeType('', 'channelDenoiseParams'),
    ShrP: makeType('', 'Pnt '),
    layerSettings: nullType,
    list: nullType,
};
var typeToField = {
    'TEXT': [
        'Txt ', 'printerName', 'Nm  ', 'Idnt', 'blackAndWhitePresetFileName', 'LUT3DFileName',
        'presetFileName', 'curvesPresetFileName', 'mixerPresetFileName', 'placed', 'description', 'reason',
        'artboardPresetName', 'json', 'clipID', 'relPath', 'fullPath', 'mediaDescriptor', 'Msge',
        'altTag', 'url', 'cellText', 'preset', 'KnNm', 'FPth', 'comment',
    ],
    'tdta': [
        'EngineData', 'LUT3DFileData', 'indexArray', 'originalVertexArray', 'deformedVertexArray',
        'LqMe',
    ],
    'long': [
        'TextIndex', 'RndS', 'Mdpn', 'Smth', 'Lctn', 'strokeStyleVersion', 'LaID', 'Vrsn', 'Cnt ',
        'Brgh', 'Cntr', 'means', 'vibrance', 'Strt', 'bwPresetKind', 'presetKind', 'comp', 'compID', 'originalCompID',
        'curvesPresetKind', 'mixerPresetKind', 'uOrder', 'vOrder', 'PgNm', 'totalPages', 'Crop',
        'numerator', 'denominator', 'frameCount', 'Annt', 'keyOriginType', 'unitValueQuadVersion',
        'keyOriginIndex', 'major', 'minor', 'fix', 'docDefaultNewArtboardBackgroundType', 'artboardBackgroundType',
        'numModifyingFX', 'deformNumRows', 'deformNumCols', 'FrID', 'FrDl', 'FsID', 'LCnt', 'AFrm', 'AFSt',
        'numBefore', 'numAfter', 'Spcn', 'minOpacity', 'maxOpacity', 'BlnM', 'sheetID', 'gblA', 'globalAltitude',
        'descVersion', 'frameReaderType', 'LyrI', 'zoomOrigin', 'fontSize', 'Rds ', 'sliceID',
        'topOutset', 'leftOutset', 'bottomOutset', 'rightOutset', 'filterID', 'meshQuality',
        'meshExpansion', 'meshRigidity', 'VrsM', 'VrsN', 'NmbG', 'WLMn', 'WLMx', 'AmMn', 'AmMx', 'SclH', 'SclV',
        'Lvl ', 'TlNm', 'TlOf', 'FlRs', 'Thsh', 'ShrS', 'ShrE', 'FlRs', 'Vrnc', 'Strg', 'ExtS', 'ExtD',
        'HrzS', 'VrtS', 'NmbR', 'EdgF', 'Ang1', 'Ang2', 'Ang3', 'Ang4', 'lastAppliedComp', 'capturedInfo',
    ],
    'enum': [
        'textGridding', 'Ornt', 'warpStyle', 'warpRotate', 'Inte', 'Bltn', 'ClrS', 'BlrQ',
        'bvlT', 'bvlS', 'bvlD', 'Md  ', 'glwS', 'GrdF', 'GlwT', 'RplS', 'BlrM', 'SmBM',
        'strokeStyleLineCapType', 'strokeStyleLineJoinType', 'strokeStyleLineAlignment',
        'strokeStyleBlendMode', 'PntT', 'Styl', 'lookupType', 'LUTFormat', 'dataOrder',
        'tableOrder', 'enableCompCore', 'enableCompCoreGPU', 'compCoreSupport', 'compCoreGPUSupport', 'Engn',
        'enableCompCoreThreads', 'gs99', 'FrDs', 'trackID', 'animInterpStyle', 'horzAlign',
        'vertAlign', 'bgColorType', 'shapeOperation', 'UndA', 'Wvtp', 'Drct', 'WndM', 'Edg ', 'FlCl', 'IntE',
        'IntC', 'Cnvr', 'Fl  ', 'Dstr', 'MztT', 'Lns ', 'ExtT', 'DspM', 'ExtR', 'ZZTy', 'SphM', 'SmBQ',
    ],
    'bool': [
        'PstS', 'printSixteenBit', 'masterFXSwitch', 'enab', 'uglg', 'antialiasGloss',
        'useShape', 'useTexture', 'uglg', 'antialiasGloss', 'useShape', 'Vsbl',
        'useTexture', 'Algn', 'Rvrs', 'Dthr', 'Invr', 'VctC', 'ShTr', 'layerConceals',
        'strokeEnabled', 'fillEnabled', 'strokeStyleScaleLock', 'strokeStyleStrokeAdjust',
        'hardProof', 'MpBl', 'paperWhite', 'useLegacy', 'Auto', 'Lab ', 'useTint', 'keyShapeInvalidated',
        'autoExpandEnabled', 'autoNestEnabled', 'autoPositionEnabled', 'shrinkwrapOnSaveEnabled',
        'present', 'showInDialog', 'overprint', 'sheetDisclosed', 'lightsDisclosed', 'meshesDisclosed',
        'materialsDisclosed', 'hasMotion', 'muted', 'Effc', 'selected', 'autoScope', 'fillCanvas',
        'cellTextIsHTML', 'Smoo', 'Clsp', 'validAtPosition', 'rigidType', 'hasoptions', 'filterMaskEnable',
        'filterMaskLinked', 'filterMaskExtendWithWhite', 'removeJPEGArtifact', 'Mnch', 'ExtF', 'ExtM',
        'moreAccurate', 'GpuY', 'LIWy',
    ],
    'doub': [
        'warpValue', 'warpPerspective', 'warpPerspectiveOther', 'Intr', 'Wdth', 'Hght',
        'strokeStyleMiterLimit', 'strokeStyleResolution', 'layerTime', 'keyOriginResolution',
        'xx', 'xy', 'yx', 'yy', 'tx', 'ty', 'FrGA', 'frameRate', 'audioLevel', 'rotation',
        'X   ', 'Y   ', 'redFloat', 'greenFloat', 'blueFloat', 'imageResolution',
        'PuX0', 'PuX1', 'PuX2', 'PuX3', 'PuY0', 'PuY1', 'PuY2', 'PuY3'
    ],
    'UntF': [
        'sdwO', 'hglO', 'lagl', 'Lald', 'srgR', 'blur', 'Sftn', 'Opct', 'Dstn', 'Angl',
        'Ckmt', 'Nose', 'Inpr', 'ShdN', 'strokeStyleLineWidth', 'strokeStyleLineDashOffset',
        'strokeStyleOpacity', 'H   ', 'Top ', 'Left', 'Btom', 'Rght', 'Rslt',
        'topRight', 'topLeft', 'bottomLeft', 'bottomRight', 'ClNs', 'Shrp',
    ],
    'VlLs': [
        'Crv ', 'Clrs', 'Mnm ', 'Mxm ', 'Trns', 'pathList', 'strokeStyleLineDashSet', 'FrLs', 'slices',
        'LaSt', 'Trnf', 'nonAffineTransform', 'keyDescriptorList', 'guideIndeces', 'gradientFillMulti',
        'solidFillMulti', 'frameFXMulti', 'innerShadowMulti', 'dropShadowMulti', 'FrIn', 'FSts', 'FsFr',
        'sheetTimelineOptions', 'audioClipList', 'trackList', 'globalTrackList', 'keyList', 'audioClipList',
        'warpValues', 'selectedPin', 'Pts ', 'SbpL', 'pathComponents', 'pinOffsets', 'posFinalPins',
        'pinVertexIndices', 'PinP', 'PnRt', 'PnOv', 'PnDp', 'filterFXList', 'puppetShapeList', 'ShrP',
        'channelDenoise', 'Mtrx', 'layerSettings', 'list', 'compList',
    ],
    'ObAr': ['meshPoints', 'quiltSliceX', 'quiltSliceY'],
    'obj ': ['null', 'Chnl'],
    'Pth ': ['DspF'],
};
var channels = [
    'Rd  ', 'Grn ', 'Bl  ', 'Yllw', 'Ylw ', 'Cyn ', 'Mgnt', 'Blck', 'Gry ', 'Lmnc', 'A   ', 'B   ',
];
var fieldToArrayType = {
    'Mnm ': 'long',
    'Mxm ': 'long',
    FrLs: 'long',
    strokeStyleLineDashSet: 'UntF',
    Trnf: 'doub',
    nonAffineTransform: 'doub',
    keyDescriptorList: 'Objc',
    gradientFillMulti: 'Objc',
    solidFillMulti: 'Objc',
    frameFXMulti: 'Objc',
    innerShadowMulti: 'Objc',
    dropShadowMulti: 'Objc',
    LaSt: 'Objc',
    FrIn: 'Objc',
    FSts: 'Objc',
    FsFr: 'long',
    blendOptions: 'Objc',
    sheetTimelineOptions: 'Objc',
    keyList: 'Objc',
    warpValues: 'doub',
    selectedPin: 'long',
    'Pts ': 'Objc',
    SbpL: 'Objc',
    pathComponents: 'Objc',
    pinOffsets: 'doub',
    posFinalPins: 'doub',
    pinVertexIndices: 'long',
    PinP: 'doub',
    PnRt: 'long',
    PnOv: 'bool',
    PnDp: 'doub',
    filterFXList: 'Objc',
    puppetShapeList: 'Objc',
    ShrP: 'Objc',
    channelDenoise: 'Objc',
    Mtrx: 'long',
    compList: 'long',
};
var fieldToType = {};
for (var _i = 0, _a = Object.keys(typeToField); _i < _a.length; _i++) {
    var type = _a[_i];
    for (var _b = 0, _c = typeToField[type]; _b < _c.length; _b++) {
        var field = _c[_b];
        fieldToType[field] = type;
    }
}
for (var _d = 0, _e = Object.keys(fieldToExtType); _d < _e.length; _d++) {
    var field = _e[_d];
    if (!fieldToType[field])
        fieldToType[field] = 'Objc';
}
for (var _f = 0, _g = Object.keys(fieldToArrayExtType); _f < _g.length; _f++) {
    var field = _g[_f];
    fieldToArrayType[field] = 'Objc';
}
function getTypeByKey(key, value, root, parent) {
    if (key === 'null' && root === 'slices') {
        return 'TEXT';
    }
    else if (key === 'groupID') {
        return root === 'slices' ? 'long' : 'TEXT';
    }
    else if (key === 'Sz  ') {
        return ('Wdth' in value) ? 'Objc' : (('units' in value) ? 'UntF' : 'doub');
    }
    else if (key === 'Type') {
        return typeof value === 'string' ? 'enum' : 'long';
    }
    else if (key === 'AntA') {
        return typeof value === 'string' ? 'enum' : 'bool';
    }
    else if ((key === 'Hrzn' || key === 'Vrtc') && parent.Type === 'keyType.Pstn') {
        return 'long';
    }
    else if (key === 'Hrzn' || key === 'Vrtc' || key === 'Top ' || key === 'Left' || key === 'Btom' || key === 'Rght') {
        if (root === 'slices')
            return 'long';
        return typeof value === 'number' ? 'doub' : 'UntF';
    }
    else if (key === 'Vrsn') {
        return typeof value === 'number' ? 'long' : 'Objc';
    }
    else if (key === 'Rd  ' || key === 'Grn ' || key === 'Bl  ') {
        return root === 'artd' ? 'long' : 'doub';
    }
    else if (key === 'Trnf') {
        return Array.isArray(value) ? 'VlLs' : 'Objc';
    }
    else {
        return fieldToType[key];
    }
}
function readAsciiStringOrClassId(reader) {
    var length = (0, psdReader_1.readInt32)(reader);
    return (0, psdReader_1.readAsciiString)(reader, length || 4);
}
exports.readAsciiStringOrClassId = readAsciiStringOrClassId;
function writeAsciiStringOrClassId(writer, value) {
    if (value.length === 4 && value !== 'warp' && value !== 'time' && value !== 'hold' && value !== 'list') {
        // write classId
        (0, psdWriter_1.writeInt32)(writer, 0);
        (0, psdWriter_1.writeSignature)(writer, value);
    }
    else {
        // write ascii string
        (0, psdWriter_1.writeInt32)(writer, value.length);
        for (var i = 0; i < value.length; i++) {
            (0, psdWriter_1.writeUint8)(writer, value.charCodeAt(i));
        }
    }
}
function readDescriptorStructure(reader, includeClass) {
    var struct = readClassStructure(reader);
    var object = includeClass ? { _name: struct.name, _classID: struct.classID } : {};
    // console.log('>> ', struct);
    var itemsCount = (0, psdReader_1.readUint32)(reader);
    for (var i = 0; i < itemsCount; i++) {
        var key = readAsciiStringOrClassId(reader);
        var type = (0, psdReader_1.readSignature)(reader);
        // console.log(`> '${key}' '${type}'`);
        var data = readOSType(reader, type, includeClass);
        // if (!getTypeByKey(key, data)) console.log(`> '${key}' '${type}'`, data);
        object[key] = data;
    }
    return object;
}
exports.readDescriptorStructure = readDescriptorStructure;
function writeDescriptorStructure(writer, name, classId, value, root) {
    if (logErrors && !classId)
        console.log('Missing classId for: ', name, classId, value);
    // write class structure
    (0, psdWriter_1.writeUnicodeStringWithPadding)(writer, name);
    writeAsciiStringOrClassId(writer, classId);
    var keys = Object.keys(value);
    var keyCount = keys.length;
    if ('_name' in value)
        keyCount--;
    if ('_classID' in value)
        keyCount--;
    (0, psdWriter_1.writeUint32)(writer, keyCount);
    for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
        var key = keys_1[_i];
        if (key === '_name' || key === '_classID')
            continue;
        var type = getTypeByKey(key, value[key], root, value);
        var extType = fieldToExtType[key];
        if (key === 'bounds' && root === 'text') {
            extType = makeType('', 'bounds');
        }
        else if (key === 'origin') {
            type = root === 'slices' ? 'enum' : 'Objc';
        }
        else if ((key === 'Cyn ' || key === 'Mgnt' || key === 'Ylw ' || key === 'Blck') && value._classID === 'CMYC') {
            type = 'doub';
        }
        else if (/^PN[a-z][a-z]$/.test(key)) {
            type = 'TEXT';
        }
        else if (/^PT[a-z][a-z]$/.test(key)) {
            type = 'long';
        }
        else if (/^PF[a-z][a-z]$/.test(key)) {
            type = 'doub';
        }
        else if (key === 'ClSz' || key === 'Rds ' || key === 'Amnt') {
            type = typeof value[key] === 'number' ? 'long' : 'UntF';
        }
        else if ((key === 'sdwM' || key === 'hglM') && typeof value[key] === 'string') {
            type = 'enum';
        }
        else if (key === 'blur' && typeof value[key] === 'string') {
            type = 'enum';
        }
        else if (key === 'Angl' && typeof value[key] === 'number') {
            type = 'doub'; // ???
        }
        else if (key === 'bounds' && root === 'slices') {
            type = 'Objc';
            extType = makeType('', 'Rct1');
        }
        else if (key === 'Scl ') {
            if (typeof value[key] === 'object' && 'Hrzn' in value[key]) {
                type = 'Objc';
                extType = nullType;
            }
            else if (typeof value[key] === 'number') {
                type = 'long';
            }
            else {
                type = 'UntF';
            }
        }
        else if (key === 'audioClipGroupList' && keys.length === 1) {
            type = 'VlLs';
        }
        else if ((key === 'Strt' || key === 'Brgh') && 'H   ' in value) {
            type = 'doub';
        }
        else if (key === 'Wdth' && typeof value[key] === 'object') {
            type = 'UntF';
        }
        else if (key === 'Ofst' && typeof value[key] === 'number') {
            type = 'long';
        }
        else if (key === 'Strt' && typeof value[key] === 'object') {
            type = 'Objc';
            extType = nullType;
        }
        else if (channels.indexOf(key) !== -1) {
            type = (classId === 'RGBC' && root !== 'artd') ? 'doub' : 'long';
        }
        else if (key === 'profile') {
            type = classId === 'printOutput' ? 'TEXT' : 'tdta';
        }
        else if (key === 'strokeStyleContent') {
            if (value[key]['Clr ']) {
                extType = makeType('', 'solidColorLayer');
            }
            else if (value[key].Grad) {
                extType = makeType('', 'gradientLayer');
            }
            else if (value[key].Ptrn) {
                extType = makeType('', 'patternLayer');
            }
            else {
                logErrors && console.log('Invalid strokeStyleContent value', value[key]);
            }
        }
        else if (key === 'bounds' && root === 'quiltWarp') {
            extType = makeType('', 'classFloatRect');
        }
        if (extType && extType.classID === 'RGBC') {
            if ('H   ' in value[key])
                extType = { classID: 'HSBC', name: '' };
            // TODO: other color spaces
        }
        writeAsciiStringOrClassId(writer, key);
        (0, psdWriter_1.writeSignature)(writer, type || 'long');
        writeOSType(writer, type || 'long', value[key], key, extType, root);
        if (logErrors && !type)
            console.log("Missing descriptor field type for: '".concat(key, "' in"), value);
    }
}
exports.writeDescriptorStructure = writeDescriptorStructure;
function readOSType(reader, type, includeClass) {
    switch (type) {
        case 'obj ': // Reference
            return readReferenceStructure(reader);
        case 'Objc': // Descriptor
        case 'GlbO': // GlobalObject same as Descriptor
            return readDescriptorStructure(reader, includeClass);
        case 'VlLs': { // List
            var length_1 = (0, psdReader_1.readInt32)(reader);
            var items = [];
            for (var i = 0; i < length_1; i++) {
                var itemType = (0, psdReader_1.readSignature)(reader);
                // console.log('  >', itemType);
                items.push(readOSType(reader, itemType, includeClass));
            }
            return items;
        }
        case 'doub': // Double
            return (0, psdReader_1.readFloat64)(reader);
        case 'UntF': { // Unit double
            var units = (0, psdReader_1.readSignature)(reader);
            var value = (0, psdReader_1.readFloat64)(reader);
            if (!unitsMap[units])
                throw new Error("Invalid units: ".concat(units));
            return { units: unitsMap[units], value: value };
        }
        case 'UnFl': { // Unit float
            var units = (0, psdReader_1.readSignature)(reader);
            var value = (0, psdReader_1.readFloat32)(reader);
            if (!unitsMap[units])
                throw new Error("Invalid units: ".concat(units));
            return { units: unitsMap[units], value: value };
        }
        case 'TEXT': // String
            return (0, psdReader_1.readUnicodeString)(reader);
        case 'enum': { // Enumerated
            var enumType = readAsciiStringOrClassId(reader);
            var value = readAsciiStringOrClassId(reader);
            return "".concat(enumType, ".").concat(value);
        }
        case 'long': // Integer
            return (0, psdReader_1.readInt32)(reader);
        case 'comp': { // Large Integer
            var low = (0, psdReader_1.readUint32)(reader);
            var high = (0, psdReader_1.readUint32)(reader);
            return { low: low, high: high };
        }
        case 'bool': // Boolean
            return !!(0, psdReader_1.readUint8)(reader);
        case 'type': // Class
        case 'GlbC': // Class
            return readClassStructure(reader);
        case 'alis': { // Alias
            var length_2 = (0, psdReader_1.readInt32)(reader);
            return (0, psdReader_1.readAsciiString)(reader, length_2);
        }
        case 'tdta': { // Raw Data
            var length_3 = (0, psdReader_1.readInt32)(reader);
            return (0, psdReader_1.readBytes)(reader, length_3);
        }
        case 'ObAr': { // Object array
            (0, psdReader_1.readInt32)(reader); // version: 16
            (0, psdReader_1.readUnicodeString)(reader); // name: ''
            readAsciiStringOrClassId(reader); // 'rationalPoint'
            var length_4 = (0, psdReader_1.readInt32)(reader);
            var items = [];
            for (var i = 0; i < length_4; i++) {
                var type1 = readAsciiStringOrClassId(reader); // type Hrzn | Vrtc
                (0, psdReader_1.readSignature)(reader); // UnFl
                (0, psdReader_1.readSignature)(reader); // units ? '#Pxl'
                var valuesCount = (0, psdReader_1.readInt32)(reader);
                var values = [];
                for (var j = 0; j < valuesCount; j++) {
                    values.push((0, psdReader_1.readFloat64)(reader));
                }
                items.push({ type: type1, values: values });
            }
            return items;
        }
        case 'Pth ': { // File path
            /*const length =*/ (0, psdReader_1.readInt32)(reader); // total size of all fields below
            var sig = (0, psdReader_1.readSignature)(reader);
            /*const pathSize =*/ (0, psdReader_1.readInt32LE)(reader); // the same as length
            var charsCount = (0, psdReader_1.readInt32LE)(reader);
            var path = (0, psdReader_1.readUnicodeStringWithLengthLE)(reader, charsCount);
            return { sig: sig, path: path };
        }
        default:
            throw new Error("Invalid TySh descriptor OSType: ".concat(type, " at ").concat(reader.offset.toString(16)));
    }
}
var ObArTypes = {
    meshPoints: 'rationalPoint',
    quiltSliceX: 'UntF',
    quiltSliceY: 'UntF',
};
function writeOSType(writer, type, value, key, extType, root) {
    switch (type) {
        case 'obj ': // Reference
            writeReferenceStructure(writer, key, value);
            break;
        case 'Objc': // Descriptor
        case 'GlbO': { // GlobalObject same as Descriptor
            if (typeof value !== 'object')
                throw new Error("Invalid struct value: ".concat(JSON.stringify(value), ", key: ").concat(key));
            if (!extType)
                throw new Error("Missing ext type for: '".concat(key, "' (").concat(JSON.stringify(value), ")"));
            var name_1 = value._name || extType.name;
            var classID = value._classID || extType.classID;
            writeDescriptorStructure(writer, name_1, classID, value, root);
            break;
        }
        case 'VlLs': // List
            if (!Array.isArray(value))
                throw new Error("Invalid list value: ".concat(JSON.stringify(value), ", key: ").concat(key));
            (0, psdWriter_1.writeInt32)(writer, value.length);
            for (var i = 0; i < value.length; i++) {
                var type_1 = fieldToArrayType[key];
                (0, psdWriter_1.writeSignature)(writer, type_1 || 'long');
                writeOSType(writer, type_1 || 'long', value[i], "".concat(key, "[]"), fieldToArrayExtType[key], root);
                if (logErrors && !type_1)
                    console.log("Missing descriptor array type for: '".concat(key, "' in"), value);
            }
            break;
        case 'doub': // Double
            if (typeof value !== 'number')
                throw new Error("Invalid number value: ".concat(JSON.stringify(value), ", key: ").concat(key));
            (0, psdWriter_1.writeFloat64)(writer, value);
            break;
        case 'UntF': // Unit double
            if (!unitsMapRev[value.units])
                throw new Error("Invalid units: ".concat(value.units, " in ").concat(key));
            (0, psdWriter_1.writeSignature)(writer, unitsMapRev[value.units]);
            (0, psdWriter_1.writeFloat64)(writer, value.value);
            break;
        case 'UnFl': // Unit float
            if (!unitsMapRev[value.units])
                throw new Error("Invalid units: ".concat(value.units, " in ").concat(key));
            (0, psdWriter_1.writeSignature)(writer, unitsMapRev[value.units]);
            (0, psdWriter_1.writeFloat32)(writer, value.value);
            break;
        case 'TEXT': // String
            (0, psdWriter_1.writeUnicodeStringWithPadding)(writer, value);
            break;
        case 'enum': { // Enumerated
            if (typeof value !== 'string')
                throw new Error("Invalid enum value: ".concat(JSON.stringify(value), ", key: ").concat(key));
            var _a = value.split('.'), _type = _a[0], val = _a[1];
            writeAsciiStringOrClassId(writer, _type);
            writeAsciiStringOrClassId(writer, val);
            break;
        }
        case 'long': // Integer
            if (typeof value !== 'number')
                throw new Error("Invalid integer value: ".concat(JSON.stringify(value), ", key: ").concat(key));
            (0, psdWriter_1.writeInt32)(writer, value);
            break;
        // case 'comp': // Large Integer
        // 	writeLargeInteger(reader);
        case 'bool': // Boolean
            if (typeof value !== 'boolean')
                throw new Error("Invalid boolean value: ".concat(JSON.stringify(value), ", key: ").concat(key));
            (0, psdWriter_1.writeUint8)(writer, value ? 1 : 0);
            break;
        // case 'type': // Class
        // case 'GlbC': // Class
        // 	writeClassStructure(reader);
        // case 'alis': // Alias
        // 	writeAliasStructure(reader);
        case 'tdta': // Raw Data
            (0, psdWriter_1.writeInt32)(writer, value.byteLength);
            (0, psdWriter_1.writeBytes)(writer, value);
            break;
        case 'ObAr': { // Object array
            (0, psdWriter_1.writeInt32)(writer, 16); // version
            (0, psdWriter_1.writeUnicodeStringWithPadding)(writer, ''); // name
            var type_2 = ObArTypes[key];
            if (!type_2)
                throw new Error("Not implemented ObArType for: ".concat(key));
            writeAsciiStringOrClassId(writer, type_2);
            (0, psdWriter_1.writeInt32)(writer, value.length);
            for (var i = 0; i < value.length; i++) {
                writeAsciiStringOrClassId(writer, value[i].type); // Hrzn | Vrtc
                (0, psdWriter_1.writeSignature)(writer, 'UnFl');
                (0, psdWriter_1.writeSignature)(writer, '#Pxl');
                (0, psdWriter_1.writeInt32)(writer, value[i].values.length);
                for (var j = 0; j < value[i].values.length; j++) {
                    (0, psdWriter_1.writeFloat64)(writer, value[i].values[j]);
                }
            }
            break;
        }
        case 'Pth ': { // File path
            var length_5 = 4 + 4 + 4 + value.path.length * 2;
            (0, psdWriter_1.writeInt32)(writer, length_5);
            (0, psdWriter_1.writeSignature)(writer, value.sig);
            (0, psdWriter_1.writeInt32LE)(writer, length_5);
            (0, psdWriter_1.writeInt32LE)(writer, value.path.length);
            (0, psdWriter_1.writeUnicodeStringWithoutLengthLE)(writer, value.path);
            break;
        }
        default:
            throw new Error("Not implemented descriptor OSType: ".concat(type));
    }
}
function readReferenceStructure(reader) {
    var itemsCount = (0, psdReader_1.readInt32)(reader);
    var items = [];
    for (var i = 0; i < itemsCount; i++) {
        var type = (0, psdReader_1.readSignature)(reader);
        switch (type) {
            case 'prop': { // Property
                readClassStructure(reader);
                var keyID = readAsciiStringOrClassId(reader);
                items.push(keyID);
                break;
            }
            case 'Clss': // Class
                items.push(readClassStructure(reader));
                break;
            case 'Enmr': { // Enumerated Reference
                readClassStructure(reader);
                var typeID = readAsciiStringOrClassId(reader);
                var value = readAsciiStringOrClassId(reader);
                items.push("".concat(typeID, ".").concat(value));
                break;
            }
            case 'rele': { // Offset
                // const { name, classID } =
                readClassStructure(reader);
                items.push((0, psdReader_1.readUint32)(reader));
                break;
            }
            case 'Idnt': // Identifier
                items.push((0, psdReader_1.readInt32)(reader));
                break;
            case 'indx': // Index
                items.push((0, psdReader_1.readInt32)(reader));
                break;
            case 'name': { // Name
                readClassStructure(reader);
                items.push((0, psdReader_1.readUnicodeString)(reader));
                break;
            }
            default:
                throw new Error("Invalid descriptor reference type: ".concat(type));
        }
    }
    return items;
}
function writeReferenceStructure(writer, _key, items) {
    (0, psdWriter_1.writeInt32)(writer, items.length);
    for (var i = 0; i < items.length; i++) {
        var value = items[i];
        var type = 'unknown';
        if (typeof value === 'string') {
            if (/^[a-z]+\.[a-z]+$/i.test(value)) {
                type = 'Enmr';
            }
            else {
                type = 'name';
            }
        }
        (0, psdWriter_1.writeSignature)(writer, type);
        switch (type) {
            // case 'prop': // Property
            // case 'Clss': // Class
            case 'Enmr': { // Enumerated Reference
                var _a = value.split('.'), typeID = _a[0], enumValue = _a[1];
                writeClassStructure(writer, '\0', typeID);
                writeAsciiStringOrClassId(writer, typeID);
                writeAsciiStringOrClassId(writer, enumValue);
                break;
            }
            // case 'rele': // Offset
            // case 'Idnt': // Identifier
            // case 'indx': // Index
            case 'name': { // Name
                writeClassStructure(writer, '\0', 'Lyr ');
                (0, psdWriter_1.writeUnicodeString)(writer, value + '\0');
                break;
            }
            default:
                throw new Error("Invalid descriptor reference type: ".concat(type));
        }
    }
    return items;
}
function readClassStructure(reader) {
    var name = (0, psdReader_1.readUnicodeString)(reader);
    var classID = readAsciiStringOrClassId(reader);
    return { name: name, classID: classID };
}
function writeClassStructure(writer, name, classID) {
    (0, psdWriter_1.writeUnicodeString)(writer, name);
    writeAsciiStringOrClassId(writer, classID);
}
function readVersionAndDescriptor(reader, includeClass) {
    if (includeClass === void 0) { includeClass = false; }
    var version = (0, psdReader_1.readUint32)(reader);
    if (version !== 16)
        throw new Error("Invalid descriptor version: ".concat(version));
    var desc = readDescriptorStructure(reader, includeClass);
    // console.log(require('util').inspect(desc, false, 99, true));
    return desc;
}
exports.readVersionAndDescriptor = readVersionAndDescriptor;
function writeVersionAndDescriptor(writer, name, classID, descriptor, root) {
    if (root === void 0) { root = ''; }
    (0, psdWriter_1.writeUint32)(writer, 16); // version
    writeDescriptorStructure(writer, name, classID, descriptor, root);
}
exports.writeVersionAndDescriptor = writeVersionAndDescriptor;
function horzVrtcToXY(hv) {
    return { x: hv.Hrzn, y: hv.Vrtc };
}
exports.horzVrtcToXY = horzVrtcToXY;
function xyToHorzVrtc(xy) {
    return { Hrzn: xy.x, Vrtc: xy.y };
}
exports.xyToHorzVrtc = xyToHorzVrtc;
function descBoundsToBounds(desc) {
    return {
        top: parseUnits(desc['Top ']),
        left: parseUnits(desc.Left),
        right: parseUnits(desc.Rght),
        bottom: parseUnits(desc.Btom),
    };
}
exports.descBoundsToBounds = descBoundsToBounds;
function boundsToDescBounds(bounds) {
    var _a;
    return _a = {
            Left: unitsValue(bounds.left, 'bounds.left')
        },
        _a['Top '] = unitsValue(bounds.top, 'bounds.top'),
        _a.Rght = unitsValue(bounds.right, 'bounds.right'),
        _a.Btom = unitsValue(bounds.bottom, 'bounds.bottom'),
        _a;
}
exports.boundsToDescBounds = boundsToDescBounds;
function parseFxObject(fx) {
    var stroke = {
        enabled: !!fx.enab,
        position: exports.FStl.decode(fx.Styl),
        fillType: exports.FrFl.decode(fx.PntT),
        blendMode: exports.BlnM.decode(fx['Md  ']),
        opacity: parsePercent(fx.Opct),
        size: parseUnits(fx['Sz  ']),
    };
    if (fx.present !== undefined)
        stroke.present = fx.present;
    if (fx.showInDialog !== undefined)
        stroke.showInDialog = fx.showInDialog;
    if (fx.overprint !== undefined)
        stroke.overprint = fx.overprint;
    if (fx['Clr '])
        stroke.color = parseColor(fx['Clr ']);
    if (fx.Grad)
        stroke.gradient = parseGradientContent(fx);
    if (fx.Ptrn)
        stroke.pattern = parsePatternContent(fx);
    return stroke;
}
function serializeFxObject(stroke) {
    var FrFX = {};
    FrFX.enab = !!stroke.enabled;
    if (stroke.present !== undefined)
        FrFX.present = !!stroke.present;
    if (stroke.showInDialog !== undefined)
        FrFX.showInDialog = !!stroke.showInDialog;
    FrFX.Styl = exports.FStl.encode(stroke.position);
    FrFX.PntT = exports.FrFl.encode(stroke.fillType);
    FrFX['Md  '] = exports.BlnM.encode(stroke.blendMode);
    FrFX.Opct = unitsPercent(stroke.opacity);
    FrFX['Sz  '] = unitsValue(stroke.size, 'size');
    if (stroke.color)
        FrFX['Clr '] = serializeColor(stroke.color);
    if (stroke.gradient)
        FrFX = __assign(__assign({}, FrFX), serializeGradientContent(stroke.gradient));
    if (stroke.pattern)
        FrFX = __assign(__assign({}, FrFX), serializePatternContent(stroke.pattern));
    if (stroke.overprint !== undefined)
        FrFX.overprint = !!stroke.overprint;
    return FrFX;
}
function serializeEffects(e, log, multi) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    var info = multi ? {
        'Scl ': unitsPercentF((_a = e.scale) !== null && _a !== void 0 ? _a : 1),
        masterFXSwitch: !e.disabled,
    } : {
        masterFXSwitch: !e.disabled,
        'Scl ': unitsPercentF((_b = e.scale) !== null && _b !== void 0 ? _b : 1),
    };
    var arrayKeys = ['dropShadow', 'innerShadow', 'solidFill', 'gradientOverlay', 'stroke'];
    for (var _i = 0, arrayKeys_1 = arrayKeys; _i < arrayKeys_1.length; _i++) {
        var key = arrayKeys_1[_i];
        if (e[key] && !Array.isArray(e[key]))
            throw new Error("".concat(key, " should be an array"));
    }
    if (((_c = e.dropShadow) === null || _c === void 0 ? void 0 : _c[0]) && !multi)
        info.DrSh = serializeEffectObject(e.dropShadow[0], 'dropShadow', log);
    if (((_d = e.dropShadow) === null || _d === void 0 ? void 0 : _d[0]) && multi)
        info.dropShadowMulti = e.dropShadow.map(function (i) { return serializeEffectObject(i, 'dropShadow', log); });
    if (((_e = e.innerShadow) === null || _e === void 0 ? void 0 : _e[0]) && !multi)
        info.IrSh = serializeEffectObject(e.innerShadow[0], 'innerShadow', log);
    if (((_f = e.innerShadow) === null || _f === void 0 ? void 0 : _f[0]) && multi)
        info.innerShadowMulti = e.innerShadow.map(function (i) { return serializeEffectObject(i, 'innerShadow', log); });
    if (e.outerGlow)
        info.OrGl = serializeEffectObject(e.outerGlow, 'outerGlow', log);
    if (((_g = e.solidFill) === null || _g === void 0 ? void 0 : _g[0]) && multi)
        info.solidFillMulti = e.solidFill.map(function (i) { return serializeEffectObject(i, 'solidFill', log); });
    if (((_h = e.gradientOverlay) === null || _h === void 0 ? void 0 : _h[0]) && multi)
        info.gradientFillMulti = e.gradientOverlay.map(function (i) { return serializeEffectObject(i, 'gradientOverlay', log); });
    if (((_j = e.stroke) === null || _j === void 0 ? void 0 : _j[0]) && multi)
        info.frameFXMulti = e.stroke.map(function (i) { return serializeFxObject(i); });
    if (e.innerGlow)
        info.IrGl = serializeEffectObject(e.innerGlow, 'innerGlow', log);
    if (e.bevel)
        info.ebbl = serializeEffectObject(e.bevel, 'bevel', log);
    if (((_k = e.solidFill) === null || _k === void 0 ? void 0 : _k[0]) && !multi)
        info.SoFi = serializeEffectObject(e.solidFill[0], 'solidFill', log);
    if (e.patternOverlay)
        info.patternFill = serializeEffectObject(e.patternOverlay, 'patternOverlay', log);
    if (((_l = e.gradientOverlay) === null || _l === void 0 ? void 0 : _l[0]) && !multi)
        info.GrFl = serializeEffectObject(e.gradientOverlay[0], 'gradientOverlay', log);
    if (e.satin)
        info.ChFX = serializeEffectObject(e.satin, 'satin', log);
    if (((_m = e.stroke) === null || _m === void 0 ? void 0 : _m[0]) && !multi)
        info.FrFX = serializeFxObject((_o = e.stroke) === null || _o === void 0 ? void 0 : _o[0]);
    if (multi) {
        info.numModifyingFX = 0;
        for (var _p = 0, _q = Object.keys(e); _p < _q.length; _p++) {
            var key = _q[_p];
            var value = e[key];
            if (Array.isArray(value)) {
                for (var _r = 0, value_1 = value; _r < value_1.length; _r++) {
                    var effect = value_1[_r];
                    if (effect.enabled)
                        info.numModifyingFX++;
                }
            }
            else if (value.enabled) {
                info.numModifyingFX++;
            }
        }
    }
    return info;
}
exports.serializeEffects = serializeEffects;
function parseEffects(info, log) {
    var effects = {};
    if (!info.masterFXSwitch)
        effects.disabled = true;
    if (info['Scl '])
        effects.scale = parsePercent(info['Scl ']);
    if (info.DrSh)
        effects.dropShadow = [parseEffectObject(info.DrSh, log)];
    if (info.dropShadowMulti)
        effects.dropShadow = info.dropShadowMulti.map(function (i) { return parseEffectObject(i, log); });
    if (info.IrSh)
        effects.innerShadow = [parseEffectObject(info.IrSh, log)];
    if (info.innerShadowMulti)
        effects.innerShadow = info.innerShadowMulti.map(function (i) { return parseEffectObject(i, log); });
    if (info.OrGl)
        effects.outerGlow = parseEffectObject(info.OrGl, log);
    if (info.IrGl)
        effects.innerGlow = parseEffectObject(info.IrGl, log);
    if (info.ebbl)
        effects.bevel = parseEffectObject(info.ebbl, log);
    if (info.SoFi)
        effects.solidFill = [parseEffectObject(info.SoFi, log)];
    if (info.solidFillMulti)
        effects.solidFill = info.solidFillMulti.map(function (i) { return parseEffectObject(i, log); });
    if (info.patternFill)
        effects.patternOverlay = parseEffectObject(info.patternFill, log);
    if (info.GrFl)
        effects.gradientOverlay = [parseEffectObject(info.GrFl, log)];
    if (info.gradientFillMulti)
        effects.gradientOverlay = info.gradientFillMulti.map(function (i) { return parseEffectObject(i, log); });
    if (info.ChFX)
        effects.satin = parseEffectObject(info.ChFX, log);
    if (info.FrFX)
        effects.stroke = [parseFxObject(info.FrFX)];
    if (info.frameFXMulti)
        effects.stroke = info.frameFXMulti.map(function (i) { return parseFxObject(i); });
    return effects;
}
exports.parseEffects = parseEffects;
function parseKeyList(keyList, logMissingFeatures) {
    var keys = [];
    for (var j = 0; j < keyList.length; j++) {
        var key = keyList[j];
        var _a = key.time, denominator = _a.denominator, numerator = _a.numerator, selected = key.selected, animKey = key.animKey;
        var time = { numerator: numerator, denominator: denominator };
        var interpolation = exports.animInterpStyleEnum.decode(key.animInterpStyle);
        switch (animKey.Type) {
            case 'keyType.Opct':
                keys.push({ interpolation: interpolation, time: time, selected: selected, type: 'opacity', value: parsePercent(animKey.Opct) });
                break;
            case 'keyType.Pstn':
                keys.push({ interpolation: interpolation, time: time, selected: selected, type: 'position', x: animKey.Hrzn, y: animKey.Vrtc });
                break;
            case 'keyType.Trnf':
                keys.push({
                    interpolation: interpolation,
                    time: time,
                    selected: selected,
                    type: 'transform',
                    scale: horzVrtcToXY(animKey['Scl ']), skew: horzVrtcToXY(animKey.Skew), rotation: animKey.rotation, translation: horzVrtcToXY(animKey.translation)
                });
                break;
            case 'keyType.sheetStyle': {
                var key_1 = { interpolation: interpolation, time: time, selected: selected, type: 'style' };
                if (animKey.sheetStyle.Lefx)
                    key_1.style = parseEffects(animKey.sheetStyle.Lefx, logMissingFeatures);
                keys.push(key_1);
                break;
            }
            case 'keyType.globalLighting': {
                keys.push({
                    interpolation: interpolation,
                    time: time,
                    selected: selected,
                    type: 'globalLighting',
                    globalAngle: animKey.gblA, globalAltitude: animKey.globalAltitude
                });
                break;
            }
            default: throw new Error("Unsupported keyType value");
        }
    }
    return keys;
}
function serializeKeyList(keys) {
    var keyList = [];
    for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        var time = key.time, _a = key.selected, selected = _a === void 0 ? false : _a, interpolation = key.interpolation;
        var animInterpStyle = exports.animInterpStyleEnum.encode(interpolation);
        var animKey = void 0;
        switch (key.type) {
            case 'opacity':
                animKey = { Type: 'keyType.Opct', Opct: unitsPercent(key.value) };
                break;
            case 'position':
                animKey = { Type: 'keyType.Pstn', Hrzn: key.x, Vrtc: key.y };
                break;
            case 'transform':
                animKey = { Type: 'keyType.Trnf', 'Scl ': xyToHorzVrtc(key.scale), Skew: xyToHorzVrtc(key.skew), rotation: key.rotation, translation: xyToHorzVrtc(key.translation) };
                break;
            case 'style':
                animKey = { Type: 'keyType.sheetStyle', sheetStyle: { Vrsn: 1, blendOptions: {} } };
                if (key.style)
                    animKey.sheetStyle = { Vrsn: 1, Lefx: serializeEffects(key.style, false, false), blendOptions: {} };
                break;
            case 'globalLighting': {
                animKey = { Type: 'keyType.globalLighting', gblA: key.globalAngle, globalAltitude: key.globalAltitude };
                break;
            }
            default: throw new Error("Unsupported keyType value");
        }
        keyList.push({ Vrsn: 1, animInterpStyle: animInterpStyle, time: time, animKey: animKey, selected: selected });
    }
    return keyList;
}
function parseTrackList(trackList, logMissingFeatures) {
    var tracks = [];
    for (var i = 0; i < trackList.length; i++) {
        var tr = trackList[i];
        var track = {
            type: exports.stdTrackID.decode(tr.trackID),
            enabled: tr.enab,
            keys: parseKeyList(tr.keyList, logMissingFeatures),
        };
        if (tr.effectParams) {
            track.effectParams = {
                fillCanvas: tr.effectParams.fillCanvas,
                zoomOrigin: tr.effectParams.zoomOrigin,
                keys: parseKeyList(tr.effectParams.keyList, logMissingFeatures),
            };
        }
        tracks.push(track);
    }
    return tracks;
}
exports.parseTrackList = parseTrackList;
function serializeTrackList(tracks) {
    var trackList = [];
    for (var i = 0; i < tracks.length; i++) {
        var t = tracks[i];
        trackList.push(__assign(__assign({ trackID: exports.stdTrackID.encode(t.type), Vrsn: 1, enab: !!t.enabled, Effc: !!t.effectParams }, (t.effectParams ? {
            effectParams: {
                keyList: serializeKeyList(t.keys),
                fillCanvas: t.effectParams.fillCanvas,
                zoomOrigin: t.effectParams.zoomOrigin,
            }
        } : {})), { keyList: serializeKeyList(t.keys) }));
    }
    return trackList;
}
exports.serializeTrackList = serializeTrackList;
function parseEffectObject(obj, reportErrors) {
    var result = {};
    for (var _i = 0, _a = Object.keys(obj); _i < _a.length; _i++) {
        var key = _a[_i];
        var val = obj[key];
        switch (key) {
            case 'enab':
                result.enabled = !!val;
                break;
            case 'uglg':
                result.useGlobalLight = !!val;
                break;
            case 'AntA':
                result.antialiased = !!val;
                break;
            case 'Algn':
                result.align = !!val;
                break;
            case 'Dthr':
                result.dither = !!val;
                break;
            case 'Invr':
                result.invert = !!val;
                break;
            case 'Rvrs':
                result.reverse = !!val;
                break;
            case 'Clr ':
                result.color = parseColor(val);
                break;
            case 'hglC':
                result.highlightColor = parseColor(val);
                break;
            case 'sdwC':
                result.shadowColor = parseColor(val);
                break;
            case 'Styl':
                result.position = exports.FStl.decode(val);
                break;
            case 'Md  ':
                result.blendMode = exports.BlnM.decode(val);
                break;
            case 'hglM':
                result.highlightBlendMode = exports.BlnM.decode(val);
                break;
            case 'sdwM':
                result.shadowBlendMode = exports.BlnM.decode(val);
                break;
            case 'bvlS':
                result.style = exports.BESl.decode(val);
                break;
            case 'bvlD':
                result.direction = exports.BESs.decode(val);
                break;
            case 'bvlT':
                result.technique = exports.bvlT.decode(val);
                break;
            case 'GlwT':
                result.technique = exports.BETE.decode(val);
                break;
            case 'glwS':
                result.source = exports.IGSr.decode(val);
                break;
            case 'Type':
                result.type = exports.GrdT.decode(val);
                break;
            case 'gs99':
                result.interpolationMethod = exports.gradientInterpolationMethodType.decode(val);
                break;
            case 'Opct':
                result.opacity = parsePercent(val);
                break;
            case 'hglO':
                result.highlightOpacity = parsePercent(val);
                break;
            case 'sdwO':
                result.shadowOpacity = parsePercent(val);
                break;
            case 'lagl':
                result.angle = parseAngle(val);
                break;
            case 'Angl':
                result.angle = parseAngle(val);
                break;
            case 'Lald':
                result.altitude = parseAngle(val);
                break;
            case 'Sftn':
                result.soften = parseUnits(val);
                break;
            case 'srgR':
                result.strength = parsePercent(val);
                break;
            case 'blur':
                result.size = parseUnits(val);
                break;
            case 'Nose':
                result.noise = parsePercent(val);
                break;
            case 'Inpr':
                result.range = parsePercent(val);
                break;
            case 'Ckmt':
                result.choke = parseUnits(val);
                break;
            case 'ShdN':
                result.jitter = parsePercent(val);
                break;
            case 'Dstn':
                result.distance = parseUnits(val);
                break;
            case 'Scl ':
                result.scale = parsePercent(val);
                break;
            case 'Ptrn':
                result.pattern = { name: val['Nm  '], id: val.Idnt };
                break;
            case 'phase':
                result.phase = { x: val.Hrzn, y: val.Vrtc };
                break;
            case 'Ofst':
                result.offset = { x: parsePercent(val.Hrzn), y: parsePercent(val.Vrtc) };
                break;
            case 'MpgS':
            case 'TrnS':
                result.contour = {
                    name: val['Nm  '],
                    curve: val['Crv '].map(function (p) { return ({ x: p.Hrzn, y: p.Vrtc }); }),
                };
                break;
            case 'Grad':
                result.gradient = parseGradient(val);
                break;
            case 'useTexture':
            case 'useShape':
            case 'layerConceals':
            case 'present':
            case 'showInDialog':
            case 'antialiasGloss':
                result[key] = val;
                break;
            case '_name':
            case '_classID':
                break;
            default:
                reportErrors && console.log("Invalid effect key: '".concat(key, "', value:"), val);
        }
    }
    return result;
}
function serializeEffectObject(obj, objName, reportErrors) {
    var result = {};
    for (var _i = 0, _a = Object.keys(obj); _i < _a.length; _i++) {
        var objKey = _a[_i];
        var key = objKey;
        var val = obj[key];
        switch (key) {
            case 'enabled':
                result.enab = !!val;
                break;
            case 'useGlobalLight':
                result.uglg = !!val;
                break;
            case 'antialiased':
                result.AntA = !!val;
                break;
            case 'align':
                result.Algn = !!val;
                break;
            case 'dither':
                result.Dthr = !!val;
                break;
            case 'invert':
                result.Invr = !!val;
                break;
            case 'reverse':
                result.Rvrs = !!val;
                break;
            case 'color':
                result['Clr '] = serializeColor(val);
                break;
            case 'highlightColor':
                result.hglC = serializeColor(val);
                break;
            case 'shadowColor':
                result.sdwC = serializeColor(val);
                break;
            case 'position':
                result.Styl = exports.FStl.encode(val);
                break;
            case 'blendMode':
                result['Md  '] = exports.BlnM.encode(val);
                break;
            case 'highlightBlendMode':
                result.hglM = exports.BlnM.encode(val);
                break;
            case 'shadowBlendMode':
                result.sdwM = exports.BlnM.encode(val);
                break;
            case 'style':
                result.bvlS = exports.BESl.encode(val);
                break;
            case 'direction':
                result.bvlD = exports.BESs.encode(val);
                break;
            case 'technique':
                if (objName === 'bevel') {
                    result.bvlT = exports.bvlT.encode(val);
                }
                else {
                    result.GlwT = exports.BETE.encode(val);
                }
                break;
            case 'source':
                result.glwS = exports.IGSr.encode(val);
                break;
            case 'type':
                result.Type = exports.GrdT.encode(val);
                break;
            case 'interpolationMethod':
                result.gs99 = exports.gradientInterpolationMethodType.encode(val);
                break;
            case 'opacity':
                result.Opct = unitsPercent(val);
                break;
            case 'highlightOpacity':
                result.hglO = unitsPercent(val);
                break;
            case 'shadowOpacity':
                result.sdwO = unitsPercent(val);
                break;
            case 'angle':
                if (objName === 'gradientOverlay' || objName === 'patternFill') {
                    result.Angl = unitsAngle(val);
                }
                else {
                    result.lagl = unitsAngle(val);
                }
                break;
            case 'altitude':
                result.Lald = unitsAngle(val);
                break;
            case 'soften':
                result.Sftn = unitsValue(val, key);
                break;
            case 'strength':
                result.srgR = unitsPercent(val);
                break;
            case 'size':
                result.blur = unitsValue(val, key);
                break;
            case 'noise':
                result.Nose = unitsPercent(val);
                break;
            case 'range':
                result.Inpr = unitsPercent(val);
                break;
            case 'choke':
                result.Ckmt = unitsValue(val, key);
                break;
            case 'jitter':
                result.ShdN = unitsPercent(val);
                break;
            case 'distance':
                result.Dstn = unitsValue(val, key);
                break;
            case 'scale':
                result['Scl '] = unitsPercent(val);
                break;
            case 'pattern':
                result.Ptrn = { 'Nm  ': val.name, Idnt: val.id };
                break;
            case 'phase':
                result.phase = { Hrzn: val.x, Vrtc: val.y };
                break;
            case 'offset':
                result.Ofst = { Hrzn: unitsPercent(val.x), Vrtc: unitsPercent(val.y) };
                break;
            case 'contour': {
                result[objName === 'satin' ? 'MpgS' : 'TrnS'] = {
                    'Nm  ': val.name,
                    'Crv ': val.curve.map(function (p) { return ({ Hrzn: p.x, Vrtc: p.y }); }),
                };
                break;
            }
            case 'gradient':
                result.Grad = serializeGradient(val);
                break;
            case 'useTexture':
            case 'useShape':
            case 'layerConceals':
            case 'present':
            case 'showInDialog':
            case 'antialiasGloss':
                result[key] = val;
                break;
            default:
                reportErrors && console.log("Invalid effect key: '".concat(key, "', value:"), val);
        }
    }
    return result;
}
function parseGradient(grad) {
    if (grad.GrdF === 'GrdF.CstS') {
        var samples_1 = grad.Intr || 4096;
        return {
            type: 'solid',
            name: grad['Nm  '],
            smoothness: grad.Intr / 4096,
            colorStops: grad.Clrs.map(function (s) { return ({
                color: parseColor(s['Clr ']),
                location: s.Lctn / samples_1,
                midpoint: s.Mdpn / 100,
            }); }),
            opacityStops: grad.Trns.map(function (s) { return ({
                opacity: parsePercent(s.Opct),
                location: s.Lctn / samples_1,
                midpoint: s.Mdpn / 100,
            }); }),
        };
    }
    else {
        return {
            type: 'noise',
            name: grad['Nm  '],
            roughness: grad.Smth / 4096,
            colorModel: exports.ClrS.decode(grad.ClrS),
            randomSeed: grad.RndS,
            restrictColors: !!grad.VctC,
            addTransparency: !!grad.ShTr,
            min: grad['Mnm '].map(function (x) { return x / 100; }),
            max: grad['Mxm '].map(function (x) { return x / 100; }),
        };
    }
}
function serializeGradient(grad) {
    var _a, _b;
    if (grad.type === 'solid') {
        var samples_2 = Math.round(((_a = grad.smoothness) !== null && _a !== void 0 ? _a : 1) * 4096);
        return {
            'Nm  ': grad.name || '',
            GrdF: 'GrdF.CstS',
            Intr: samples_2,
            Clrs: grad.colorStops.map(function (s) {
                var _a;
                return ({
                    'Clr ': serializeColor(s.color),
                    Type: 'Clry.UsrS',
                    Lctn: Math.round(s.location * samples_2),
                    Mdpn: Math.round(((_a = s.midpoint) !== null && _a !== void 0 ? _a : 0.5) * 100),
                });
            }),
            Trns: grad.opacityStops.map(function (s) {
                var _a;
                return ({
                    Opct: unitsPercent(s.opacity),
                    Lctn: Math.round(s.location * samples_2),
                    Mdpn: Math.round(((_a = s.midpoint) !== null && _a !== void 0 ? _a : 0.5) * 100),
                });
            }),
        };
    }
    else {
        return {
            GrdF: 'GrdF.ClNs',
            'Nm  ': grad.name || '',
            ShTr: !!grad.addTransparency,
            VctC: !!grad.restrictColors,
            ClrS: exports.ClrS.encode(grad.colorModel),
            RndS: grad.randomSeed || 0,
            Smth: Math.round(((_b = grad.roughness) !== null && _b !== void 0 ? _b : 1) * 4096),
            'Mnm ': (grad.min || [0, 0, 0, 0]).map(function (x) { return x * 100; }),
            'Mxm ': (grad.max || [1, 1, 1, 1]).map(function (x) { return x * 100; }),
        };
    }
}
function parseGradientContent(descriptor) {
    var result = parseGradient(descriptor.Grad);
    result.style = exports.GrdT.decode(descriptor.Type);
    if (descriptor.Dthr !== undefined)
        result.dither = descriptor.Dthr;
    if (descriptor.Rvrs !== undefined)
        result.reverse = descriptor.Rvrs;
    if (descriptor.Angl !== undefined)
        result.angle = parseAngle(descriptor.Angl);
    if (descriptor['Scl '] !== undefined)
        result.scale = parsePercent(descriptor['Scl ']);
    if (descriptor.Algn !== undefined)
        result.align = descriptor.Algn;
    if (descriptor.Ofst !== undefined) {
        result.offset = {
            x: parsePercent(descriptor.Ofst.Hrzn),
            y: parsePercent(descriptor.Ofst.Vrtc)
        };
    }
    return result;
}
function parsePatternContent(descriptor) {
    var result = {
        name: descriptor.Ptrn['Nm  '],
        id: descriptor.Ptrn.Idnt,
    };
    if (descriptor.Lnkd !== undefined)
        result.linked = descriptor.Lnkd;
    if (descriptor.phase !== undefined)
        result.phase = { x: descriptor.phase.Hrzn, y: descriptor.phase.Vrtc };
    return result;
}
function parseVectorContent(descriptor) {
    if ('Grad' in descriptor) {
        return parseGradientContent(descriptor);
    }
    else if ('Ptrn' in descriptor) {
        return __assign({ type: 'pattern' }, parsePatternContent(descriptor));
    }
    else if ('Clr ' in descriptor) {
        return { type: 'color', color: parseColor(descriptor['Clr ']) };
    }
    else {
        throw new Error('Invalid vector content');
    }
}
exports.parseVectorContent = parseVectorContent;
function serializeGradientContent(content) {
    var result = {};
    if (content.dither !== undefined)
        result.Dthr = content.dither;
    if (content.reverse !== undefined)
        result.Rvrs = content.reverse;
    if (content.angle !== undefined)
        result.Angl = unitsAngle(content.angle);
    result.Type = exports.GrdT.encode(content.style);
    if (content.align !== undefined)
        result.Algn = content.align;
    if (content.scale !== undefined)
        result['Scl '] = unitsPercent(content.scale);
    if (content.offset) {
        result.Ofst = {
            Hrzn: unitsPercent(content.offset.x),
            Vrtc: unitsPercent(content.offset.y),
        };
    }
    result.Grad = serializeGradient(content);
    return result;
}
function serializePatternContent(content) {
    var result = {
        Ptrn: {
            'Nm  ': content.name || '',
            Idnt: content.id || '',
        }
    };
    if (content.linked !== undefined)
        result.Lnkd = !!content.linked;
    if (content.phase !== undefined)
        result.phase = { Hrzn: content.phase.x, Vrtc: content.phase.y };
    return result;
}
function serializeVectorContent(content) {
    if (content.type === 'color') {
        return { key: 'SoCo', descriptor: { 'Clr ': serializeColor(content.color) } };
    }
    else if (content.type === 'pattern') {
        return { key: 'PtFl', descriptor: serializePatternContent(content) };
    }
    else {
        return { key: 'GdFl', descriptor: serializeGradientContent(content) };
    }
}
exports.serializeVectorContent = serializeVectorContent;
function parseColor(color) {
    if ('H   ' in color) {
        return { h: parsePercentOrAngle(color['H   ']), s: color.Strt, b: color.Brgh };
    }
    else if ('Rd  ' in color) {
        return { r: color['Rd  '], g: color['Grn '], b: color['Bl  '] };
    }
    else if ('Cyn ' in color) {
        return { c: color['Cyn '], m: color.Mgnt, y: color['Ylw '], k: color.Blck };
    }
    else if ('Gry ' in color) {
        return { k: color['Gry '] };
    }
    else if ('Lmnc' in color) {
        return { l: color.Lmnc, a: color['A   '], b: color['B   '] };
    }
    else if ('redFloat' in color) {
        return { fr: color.redFloat, fg: color.greenFloat, fb: color.blueFloat };
    }
    else {
        throw new Error('Unsupported color descriptor');
    }
}
exports.parseColor = parseColor;
function serializeColor(color) {
    if (!color) {
        return { _name: '', _classID: 'RGBC', 'Rd  ': 0, 'Grn ': 0, 'Bl  ': 0 };
    }
    else if ('r' in color) {
        return { _name: '', _classID: 'RGBC', 'Rd  ': color.r || 0, 'Grn ': color.g || 0, 'Bl  ': color.b || 0 };
    }
    else if ('fr' in color) {
        return { _name: '', _classID: 'RGBC', redFloat: color.fr, greenFloat: color.fg, blueFloat: color.fb };
    }
    else if ('h' in color) {
        return { _name: '', _classID: 'HSBC', 'H   ': unitsAngle(color.h * 360), Strt: color.s || 0, Brgh: color.b || 0 };
    }
    else if ('c' in color) {
        return { _name: '', _classID: 'CMYC', 'Cyn ': color.c || 0, Mgnt: color.m || 0, 'Ylw ': color.y || 0, Blck: color.k || 0 };
    }
    else if ('l' in color) {
        return { _name: '', _classID: 'LABC', Lmnc: color.l || 0, 'A   ': color.a || 0, 'B   ': color.b || 0 };
    }
    else if ('k' in color) {
        return { _name: '', _classID: 'GRYC', 'Gry ': color.k };
    }
    else {
        throw new Error('Invalid color value');
    }
}
exports.serializeColor = serializeColor;
function parseAngle(x) {
    if (x === undefined)
        return 0;
    if (x.units !== 'Angle')
        throw new Error("Invalid units: ".concat(x.units));
    return x.value;
}
exports.parseAngle = parseAngle;
function parsePercent(x) {
    if (x === undefined)
        return 1;
    if (x.units !== 'Percent')
        throw new Error("Invalid units: ".concat(x.units));
    return x.value / 100;
}
exports.parsePercent = parsePercent;
function parsePercentOrAngle(x) {
    if (x === undefined)
        return 1;
    if (x.units === 'Percent')
        return x.value / 100;
    if (x.units === 'Angle')
        return x.value / 360;
    throw new Error("Invalid units: ".concat(x.units));
}
exports.parsePercentOrAngle = parsePercentOrAngle;
function parseUnits(_a) {
    var units = _a.units, value = _a.value;
    if (units !== 'Pixels' && units !== 'Millimeters' && units !== 'Points' && units !== 'None' &&
        units !== 'Picas' && units !== 'Inches' && units !== 'Centimeters' && units !== 'Density') {
        throw new Error("Invalid units: ".concat(JSON.stringify({ units: units, value: value })));
    }
    return { value: value, units: units };
}
exports.parseUnits = parseUnits;
function parseUnitsOrNumber(value, units) {
    if (units === void 0) { units = 'Pixels'; }
    if (typeof value === 'number')
        return { value: value, units: units };
    return parseUnits(value);
}
exports.parseUnitsOrNumber = parseUnitsOrNumber;
function parseUnitsToNumber(_a, expectedUnits) {
    var units = _a.units, value = _a.value;
    if (units !== expectedUnits)
        throw new Error("Invalid units: ".concat(JSON.stringify({ units: units, value: value })));
    return value;
}
exports.parseUnitsToNumber = parseUnitsToNumber;
function unitsAngle(value) {
    return { units: 'Angle', value: value || 0 };
}
exports.unitsAngle = unitsAngle;
function unitsPercent(value) {
    return { units: 'Percent', value: Math.round((value || 0) * 100) };
}
exports.unitsPercent = unitsPercent;
function unitsPercentF(value) {
    return { units: 'Percent', value: (value || 0) * 100 };
}
exports.unitsPercentF = unitsPercentF;
function unitsValue(x, key) {
    if (x == null)
        return { units: 'Pixels', value: 0 };
    if (typeof x !== 'object')
        throw new Error("Invalid value: ".concat(JSON.stringify(x), " (key: ").concat(key, ") (should have value and units)"));
    var units = x.units, value = x.value;
    if (typeof value !== 'number')
        throw new Error("Invalid value in ".concat(JSON.stringify(x), " (key: ").concat(key, ")"));
    if (units !== 'Pixels' && units !== 'Millimeters' && units !== 'Points' && units !== 'None' &&
        units !== 'Picas' && units !== 'Inches' && units !== 'Centimeters' && units !== 'Density') {
        throw new Error("Invalid units in ".concat(JSON.stringify(x), " (key: ").concat(key, ")"));
    }
    return { units: units, value: value };
}
exports.unitsValue = unitsValue;
function frac(_a) {
    var numerator = _a.numerator, denominator = _a.denominator;
    return { numerator: numerator, denominator: denominator };
}
exports.frac = frac;
exports.textGridding = (0, helpers_1.createEnum)('textGridding', 'none', {
    none: 'None',
    round: 'Rnd ',
});
exports.Ornt = (0, helpers_1.createEnum)('Ornt', 'horizontal', {
    horizontal: 'Hrzn',
    vertical: 'Vrtc',
});
exports.Annt = (0, helpers_1.createEnum)('Annt', 'sharp', {
    none: 'Anno',
    sharp: 'antiAliasSharp',
    crisp: 'AnCr',
    strong: 'AnSt',
    smooth: 'AnSm',
    platform: 'antiAliasPlatformGray',
    platformLCD: 'antiAliasPlatformLCD',
});
exports.warpStyle = (0, helpers_1.createEnum)('warpStyle', 'none', {
    none: 'warpNone',
    arc: 'warpArc',
    arcLower: 'warpArcLower',
    arcUpper: 'warpArcUpper',
    arch: 'warpArch',
    bulge: 'warpBulge',
    shellLower: 'warpShellLower',
    shellUpper: 'warpShellUpper',
    flag: 'warpFlag',
    wave: 'warpWave',
    fish: 'warpFish',
    rise: 'warpRise',
    fisheye: 'warpFisheye',
    inflate: 'warpInflate',
    squeeze: 'warpSqueeze',
    twist: 'warpTwist',
    cylinder: 'warpCylinder',
    custom: 'warpCustom',
});
exports.BlnM = (0, helpers_1.createEnum)('BlnM', 'normal', {
    'normal': 'Nrml',
    'dissolve': 'Dslv',
    'darken': 'Drkn',
    'multiply': 'Mltp',
    'color burn': 'CBrn',
    'linear burn': 'linearBurn',
    'darker color': 'darkerColor',
    'lighten': 'Lghn',
    'screen': 'Scrn',
    'color dodge': 'CDdg',
    'linear dodge': 'linearDodge',
    'lighter color': 'lighterColor',
    'overlay': 'Ovrl',
    'soft light': 'SftL',
    'hard light': 'HrdL',
    'vivid light': 'vividLight',
    'linear light': 'linearLight',
    'pin light': 'pinLight',
    'hard mix': 'hardMix',
    'difference': 'Dfrn',
    'exclusion': 'Xclu',
    'subtract': 'blendSubtraction',
    'divide': 'blendDivide',
    'hue': 'H   ',
    'saturation': 'Strt',
    'color': 'Clr ',
    'luminosity': 'Lmns',
    // used in ABR
    'linear height': 'linearHeight',
    'height': 'Hght',
    'subtraction': 'Sbtr', // 2nd version of subtract ?
});
exports.BESl = (0, helpers_1.createEnum)('BESl', 'inner bevel', {
    'inner bevel': 'InrB',
    'outer bevel': 'OtrB',
    'emboss': 'Embs',
    'pillow emboss': 'PlEb',
    'stroke emboss': 'strokeEmboss',
});
exports.bvlT = (0, helpers_1.createEnum)('bvlT', 'smooth', {
    'smooth': 'SfBL',
    'chisel hard': 'PrBL',
    'chisel soft': 'Slmt',
});
exports.BESs = (0, helpers_1.createEnum)('BESs', 'up', {
    up: 'In  ',
    down: 'Out ',
});
exports.BETE = (0, helpers_1.createEnum)('BETE', 'softer', {
    softer: 'SfBL',
    precise: 'PrBL',
});
exports.IGSr = (0, helpers_1.createEnum)('IGSr', 'edge', {
    edge: 'SrcE',
    center: 'SrcC',
});
exports.GrdT = (0, helpers_1.createEnum)('GrdT', 'linear', {
    linear: 'Lnr ',
    radial: 'Rdl ',
    angle: 'Angl',
    reflected: 'Rflc',
    diamond: 'Dmnd',
});
exports.animInterpStyleEnum = (0, helpers_1.createEnum)('animInterpStyle', 'linear', {
    linear: 'Lnr ',
    hold: 'hold',
});
exports.stdTrackID = (0, helpers_1.createEnum)('stdTrackID', 'opacity', {
    opacity: 'opacityTrack',
    style: 'styleTrack',
    sheetTransform: 'sheetTransformTrack',
    sheetPosition: 'sheetPositionTrack',
    globalLighting: 'globalLightingTrack',
});
exports.gradientInterpolationMethodType = (0, helpers_1.createEnum)('gradientInterpolationMethodType', 'perceptual', {
    perceptual: 'Perc',
    linear: 'Lnr',
    classic: 'Gcls',
});
exports.ClrS = (0, helpers_1.createEnum)('ClrS', 'rgb', {
    rgb: 'RGBC',
    hsb: 'HSBl',
    lab: 'LbCl',
    hsl: 'HSLC',
});
exports.FStl = (0, helpers_1.createEnum)('FStl', 'outside', {
    outside: 'OutF',
    center: 'CtrF',
    inside: 'InsF'
});
exports.FrFl = (0, helpers_1.createEnum)('FrFl', 'color', {
    color: 'SClr',
    gradient: 'GrFl',
    pattern: 'Ptrn',
});
exports.ESliceType = (0, helpers_1.createEnum)('ESliceType', 'image', {
    image: 'Img ',
    noImage: 'noImage',
});
exports.ESliceHorzAlign = (0, helpers_1.createEnum)('ESliceHorzAlign', 'default', {
    default: 'default',
});
exports.ESliceVertAlign = (0, helpers_1.createEnum)('ESliceVertAlign', 'default', {
    default: 'default',
});
exports.ESliceOrigin = (0, helpers_1.createEnum)('ESliceOrigin', 'userGenerated', {
    userGenerated: 'userGenerated',
    autoGenerated: 'autoGenerated',
    layer: 'layer',
});
exports.ESliceBGColorType = (0, helpers_1.createEnum)('ESliceBGColorType', 'none', {
    none: 'None',
    matte: 'matte',
    color: 'Clr ',
});
exports.strokeStyleLineCapType = (0, helpers_1.createEnum)('strokeStyleLineCapType', 'butt', {
    butt: 'strokeStyleButtCap',
    round: 'strokeStyleRoundCap',
    square: 'strokeStyleSquareCap',
});
exports.strokeStyleLineJoinType = (0, helpers_1.createEnum)('strokeStyleLineJoinType', 'miter', {
    miter: 'strokeStyleMiterJoin',
    round: 'strokeStyleRoundJoin',
    bevel: 'strokeStyleBevelJoin',
});
exports.strokeStyleLineAlignment = (0, helpers_1.createEnum)('strokeStyleLineAlignment', 'inside', {
    inside: 'strokeStyleAlignInside',
    center: 'strokeStyleAlignCenter',
    outside: 'strokeStyleAlignOutside',
});
exports.BlrM = (0, helpers_1.createEnum)('BlrM', 'ispinmage', {
    spin: 'Spn ',
    zoom: 'Zm  ',
});
exports.BlrQ = (0, helpers_1.createEnum)('BlrQ', 'good', {
    draft: 'Drft',
    good: 'Gd  ',
    best: 'Bst ',
});
exports.SmBM = (0, helpers_1.createEnum)('SmBM', 'normal', {
    normal: 'SBMN',
    'edge only': 'SBME',
    'overlay edge': 'SBMO',
});
exports.SmBQ = (0, helpers_1.createEnum)('SmBQ', 'medium', {
    low: 'SBQL',
    medium: 'SBQM',
    high: 'SBQH',
});
exports.DspM = (0, helpers_1.createEnum)('DspM', 'stretch to fit', {
    'stretch to fit': 'StrF',
    'tile': 'Tile',
});
exports.UndA = (0, helpers_1.createEnum)('UndA', 'repeat edge pixels', {
    'wrap around': 'WrpA',
    'repeat edge pixels': 'RptE',
});
exports.Cnvr = (0, helpers_1.createEnum)('Cnvr', 'rectangular to polar', {
    'rectangular to polar': 'RctP',
    'polar to rectangular': 'PlrR',
});
exports.RplS = (0, helpers_1.createEnum)('RplS', 'medium', {
    small: 'Sml ',
    medium: 'Mdm ',
    large: 'Lrg ',
});
exports.SphM = (0, helpers_1.createEnum)('SphM', 'normal', {
    'normal': 'Nrml',
    'horizontal only': 'HrzO',
    'vertical only': 'VrtO',
});
exports.Wvtp = (0, helpers_1.createEnum)('Wvtp', 'sine', {
    sine: 'WvSn',
    triangle: 'WvTr',
    square: 'WvSq',
});
exports.ZZTy = (0, helpers_1.createEnum)('ZZTy', 'pond ripples', {
    'around center': 'ArnC',
    'out from center': 'OtFr',
    'pond ripples': 'PndR',
});
exports.Dstr = (0, helpers_1.createEnum)('Dstr', 'uniform', {
    uniform: 'Unfr',
    gaussian: 'Gsn ',
});
exports.Chnl = (0, helpers_1.createEnum)('Chnl', 'composite', {
    red: 'Rd  ',
    green: 'Grn ',
    blue: 'Bl  ',
    composite: 'Cmps',
});
exports.MztT = (0, helpers_1.createEnum)('MztT', 'fine dots', {
    'fine dots': 'FnDt',
    'medium dots': 'MdmD',
    'grainy dots': 'GrnD',
    'coarse dots': 'CrsD',
    'short lines': 'ShrL',
    'medium lines': 'MdmL',
    'long lines': 'LngL',
    'short strokes': 'ShSt',
    'medium strokes': 'MdmS',
    'long strokes': 'LngS',
});
exports.Lns = (0, helpers_1.createEnum)('Lns ', '50-300mm zoom', {
    '50-300mm zoom': 'Zm  ',
    '32mm prime': 'Nkn ',
    '105mm prime': 'Nkn1',
    'movie prime': 'PnVs',
});
exports.blurType = (0, helpers_1.createEnum)('blurType', 'gaussian blur', {
    'gaussian blur': 'GsnB',
    'lens blur': 'lensBlur',
    'motion blur': 'MtnB',
});
exports.DfsM = (0, helpers_1.createEnum)('DfsM', 'normal', {
    'normal': 'Nrml',
    'darken only': 'DrkO',
    'lighten only': 'LghO',
    'anisotropic': 'anisotropic',
});
exports.ExtT = (0, helpers_1.createEnum)('ExtT', 'blocks', {
    blocks: 'Blks',
    pyramids: 'Pyrm',
});
exports.ExtR = (0, helpers_1.createEnum)('ExtR', 'random', {
    random: 'Rndm',
    'level-based': 'LvlB',
});
exports.FlCl = (0, helpers_1.createEnum)('FlCl', 'background color', {
    'background color': 'FlBc',
    'foreground color': 'FlFr',
    'inverse image': 'FlIn',
    'unaltered image': 'FlSm',
});
exports.CntE = (0, helpers_1.createEnum)('CntE', 'upper', {
    lower: 'Lwr ',
    upper: 'Upr ',
});
exports.WndM = (0, helpers_1.createEnum)('WndM', 'wind', {
    wind: 'Wnd ',
    blast: 'Blst',
    stagger: 'Stgr',
});
exports.Drct = (0, helpers_1.createEnum)('Drct', 'from the right', {
    left: 'Left',
    right: 'Rght',
});
exports.IntE = (0, helpers_1.createEnum)('IntE', 'odd lines', {
    'odd lines': 'ElmO',
    'even lines': 'ElmE',
});
exports.IntC = (0, helpers_1.createEnum)('IntC', 'interpolation', {
    duplication: 'CrtD',
    interpolation: 'CrtI',
});
exports.FlMd = (0, helpers_1.createEnum)('FlMd', 'wrap around', {
    'set to transparent': 'Bckg',
    'repeat edge pixels': 'Rpt ',
    'wrap around': 'Wrp ',
});
exports.prjM = (0, helpers_1.createEnum)('prjM', 'fisheye', {
    'fisheye': 'fisP',
    'perspective': 'perP',
    'auto': 'auto',
    'full spherical': 'fusP',
});

},{"./helpers":7,"./psdReader":11,"./psdWriter":12}],5:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeEffects = exports.readEffects = void 0;
var helpers_1 = require("./helpers");
var psdReader_1 = require("./psdReader");
var psdWriter_1 = require("./psdWriter");
var bevelStyles = [
    undefined, 'outer bevel', 'inner bevel', 'emboss', 'pillow emboss', 'stroke emboss'
];
function readBlendMode(reader) {
    (0, psdReader_1.checkSignature)(reader, '8BIM');
    return helpers_1.toBlendMode[(0, psdReader_1.readSignature)(reader)] || 'normal';
}
function writeBlendMode(writer, mode) {
    (0, psdWriter_1.writeSignature)(writer, '8BIM');
    (0, psdWriter_1.writeSignature)(writer, helpers_1.fromBlendMode[mode] || 'norm');
}
function readFixedPoint8(reader) {
    return (0, psdReader_1.readUint8)(reader) / 0xff;
}
function writeFixedPoint8(writer, value) {
    (0, psdWriter_1.writeUint8)(writer, Math.round(value * 0xff) | 0);
}
function readEffects(reader) {
    var version = (0, psdReader_1.readUint16)(reader);
    if (version !== 0)
        throw new Error("Invalid effects layer version: ".concat(version));
    var effectsCount = (0, psdReader_1.readUint16)(reader);
    var effects = {};
    for (var i = 0; i < effectsCount; i++) {
        (0, psdReader_1.checkSignature)(reader, '8BIM');
        var type = (0, psdReader_1.readSignature)(reader);
        switch (type) {
            case 'cmnS': { // common state (see See Effects layer, common state info)
                var size = (0, psdReader_1.readUint32)(reader);
                var version_1 = (0, psdReader_1.readUint32)(reader);
                var visible = !!(0, psdReader_1.readUint8)(reader);
                (0, psdReader_1.skipBytes)(reader, 2);
                if (size !== 7 || version_1 !== 0 || !visible)
                    throw new Error("Invalid effects common state");
                break;
            }
            case 'dsdw': // drop shadow (see See Effects layer, drop shadow and inner shadow info)
            case 'isdw': { // inner shadow (see See Effects layer, drop shadow and inner shadow info)
                var blockSize = (0, psdReader_1.readUint32)(reader);
                var version_2 = (0, psdReader_1.readUint32)(reader);
                if (blockSize !== 41 && blockSize !== 51)
                    throw new Error("Invalid shadow size: ".concat(blockSize));
                if (version_2 !== 0 && version_2 !== 2)
                    throw new Error("Invalid shadow version: ".concat(version_2));
                var size = (0, psdReader_1.readFixedPoint32)(reader);
                (0, psdReader_1.readFixedPoint32)(reader); // intensity
                var angle = (0, psdReader_1.readFixedPoint32)(reader);
                var distance = (0, psdReader_1.readFixedPoint32)(reader);
                var color = (0, psdReader_1.readColor)(reader);
                var blendMode = readBlendMode(reader);
                var enabled = !!(0, psdReader_1.readUint8)(reader);
                var useGlobalLight = !!(0, psdReader_1.readUint8)(reader);
                var opacity = readFixedPoint8(reader);
                if (blockSize >= 51)
                    (0, psdReader_1.readColor)(reader); // native color
                var shadowInfo = {
                    size: { units: 'Pixels', value: size },
                    distance: { units: 'Pixels', value: distance },
                    angle: angle,
                    color: color,
                    blendMode: blendMode,
                    enabled: enabled,
                    useGlobalLight: useGlobalLight,
                    opacity: opacity
                };
                if (type === 'dsdw') {
                    effects.dropShadow = [shadowInfo];
                }
                else {
                    effects.innerShadow = [shadowInfo];
                }
                break;
            }
            case 'oglw': { // outer glow (see See Effects layer, outer glow info)
                var blockSize = (0, psdReader_1.readUint32)(reader);
                var version_3 = (0, psdReader_1.readUint32)(reader);
                if (blockSize !== 32 && blockSize !== 42)
                    throw new Error("Invalid outer glow size: ".concat(blockSize));
                if (version_3 !== 0 && version_3 !== 2)
                    throw new Error("Invalid outer glow version: ".concat(version_3));
                var size = (0, psdReader_1.readFixedPoint32)(reader);
                (0, psdReader_1.readFixedPoint32)(reader); // intensity
                var color = (0, psdReader_1.readColor)(reader);
                var blendMode = readBlendMode(reader);
                var enabled = !!(0, psdReader_1.readUint8)(reader);
                var opacity = readFixedPoint8(reader);
                if (blockSize >= 42)
                    (0, psdReader_1.readColor)(reader); // native color
                effects.outerGlow = {
                    size: { units: 'Pixels', value: size },
                    color: color,
                    blendMode: blendMode,
                    enabled: enabled,
                    opacity: opacity
                };
                break;
            }
            case 'iglw': { // inner glow (see See Effects layer, inner glow info)
                var blockSize = (0, psdReader_1.readUint32)(reader);
                var version_4 = (0, psdReader_1.readUint32)(reader);
                if (blockSize !== 32 && blockSize !== 43)
                    throw new Error("Invalid inner glow size: ".concat(blockSize));
                if (version_4 !== 0 && version_4 !== 2)
                    throw new Error("Invalid inner glow version: ".concat(version_4));
                var size = (0, psdReader_1.readFixedPoint32)(reader);
                (0, psdReader_1.readFixedPoint32)(reader); // intensity
                var color = (0, psdReader_1.readColor)(reader);
                var blendMode = readBlendMode(reader);
                var enabled = !!(0, psdReader_1.readUint8)(reader);
                var opacity = readFixedPoint8(reader);
                if (blockSize >= 43) {
                    (0, psdReader_1.readUint8)(reader); // inverted
                    (0, psdReader_1.readColor)(reader); // native color
                }
                effects.innerGlow = {
                    size: { units: 'Pixels', value: size },
                    color: color,
                    blendMode: blendMode,
                    enabled: enabled,
                    opacity: opacity
                };
                break;
            }
            case 'bevl': { // bevel (see See Effects layer, bevel info)
                var blockSize = (0, psdReader_1.readUint32)(reader);
                var version_5 = (0, psdReader_1.readUint32)(reader);
                if (blockSize !== 58 && blockSize !== 78)
                    throw new Error("Invalid bevel size: ".concat(blockSize));
                if (version_5 !== 0 && version_5 !== 2)
                    throw new Error("Invalid bevel version: ".concat(version_5));
                var angle = (0, psdReader_1.readFixedPoint32)(reader);
                var strength = (0, psdReader_1.readFixedPoint32)(reader);
                var size = (0, psdReader_1.readFixedPoint32)(reader);
                var highlightBlendMode = readBlendMode(reader);
                var shadowBlendMode = readBlendMode(reader);
                var highlightColor = (0, psdReader_1.readColor)(reader);
                var shadowColor = (0, psdReader_1.readColor)(reader);
                var style = bevelStyles[(0, psdReader_1.readUint8)(reader)] || 'inner bevel';
                var highlightOpacity = readFixedPoint8(reader);
                var shadowOpacity = readFixedPoint8(reader);
                var enabled = !!(0, psdReader_1.readUint8)(reader);
                var useGlobalLight = !!(0, psdReader_1.readUint8)(reader);
                var direction = (0, psdReader_1.readUint8)(reader) ? 'down' : 'up';
                if (blockSize >= 78) {
                    (0, psdReader_1.readColor)(reader); // real highlight color
                    (0, psdReader_1.readColor)(reader); // real shadow color
                }
                effects.bevel = {
                    size: { units: 'Pixels', value: size },
                    angle: angle,
                    strength: strength,
                    highlightBlendMode: highlightBlendMode,
                    shadowBlendMode: shadowBlendMode,
                    highlightColor: highlightColor,
                    shadowColor: shadowColor,
                    style: style,
                    highlightOpacity: highlightOpacity,
                    shadowOpacity: shadowOpacity,
                    enabled: enabled,
                    useGlobalLight: useGlobalLight,
                    direction: direction,
                };
                break;
            }
            case 'sofi': { // solid fill (Photoshop 7.0) (see See Effects layer, solid fill (added in Photoshop 7.0))
                var size = (0, psdReader_1.readUint32)(reader);
                var version_6 = (0, psdReader_1.readUint32)(reader);
                if (size !== 34)
                    throw new Error("Invalid effects solid fill info size: ".concat(size));
                if (version_6 !== 2)
                    throw new Error("Invalid effects solid fill info version: ".concat(version_6));
                var blendMode = readBlendMode(reader);
                var color = (0, psdReader_1.readColor)(reader);
                var opacity = readFixedPoint8(reader);
                var enabled = !!(0, psdReader_1.readUint8)(reader);
                (0, psdReader_1.readColor)(reader); // native color
                effects.solidFill = [{ blendMode: blendMode, color: color, opacity: opacity, enabled: enabled }];
                break;
            }
            default:
                throw new Error("Invalid effect type: '".concat(type, "'"));
        }
    }
    return effects;
}
exports.readEffects = readEffects;
function writeShadowInfo(writer, shadow) {
    var _a;
    (0, psdWriter_1.writeUint32)(writer, 51);
    (0, psdWriter_1.writeUint32)(writer, 2);
    (0, psdWriter_1.writeFixedPoint32)(writer, shadow.size && shadow.size.value || 0);
    (0, psdWriter_1.writeFixedPoint32)(writer, 0); // intensity
    (0, psdWriter_1.writeFixedPoint32)(writer, shadow.angle || 0);
    (0, psdWriter_1.writeFixedPoint32)(writer, shadow.distance && shadow.distance.value || 0);
    (0, psdWriter_1.writeColor)(writer, shadow.color);
    writeBlendMode(writer, shadow.blendMode);
    (0, psdWriter_1.writeUint8)(writer, shadow.enabled ? 1 : 0);
    (0, psdWriter_1.writeUint8)(writer, shadow.useGlobalLight ? 1 : 0);
    writeFixedPoint8(writer, (_a = shadow.opacity) !== null && _a !== void 0 ? _a : 1);
    (0, psdWriter_1.writeColor)(writer, shadow.color); // native color
}
function writeEffects(writer, effects) {
    var _a, _b, _c, _d, _e, _f;
    var dropShadow = (_a = effects.dropShadow) === null || _a === void 0 ? void 0 : _a[0];
    var innerShadow = (_b = effects.innerShadow) === null || _b === void 0 ? void 0 : _b[0];
    var outerGlow = effects.outerGlow;
    var innerGlow = effects.innerGlow;
    var bevel = effects.bevel;
    var solidFill = (_c = effects.solidFill) === null || _c === void 0 ? void 0 : _c[0];
    var count = 1;
    if (dropShadow)
        count++;
    if (innerShadow)
        count++;
    if (outerGlow)
        count++;
    if (innerGlow)
        count++;
    if (bevel)
        count++;
    if (solidFill)
        count++;
    (0, psdWriter_1.writeUint16)(writer, 0);
    (0, psdWriter_1.writeUint16)(writer, count);
    (0, psdWriter_1.writeSignature)(writer, '8BIM');
    (0, psdWriter_1.writeSignature)(writer, 'cmnS');
    (0, psdWriter_1.writeUint32)(writer, 7); // size
    (0, psdWriter_1.writeUint32)(writer, 0); // version
    (0, psdWriter_1.writeUint8)(writer, 1); // visible
    (0, psdWriter_1.writeZeros)(writer, 2);
    if (dropShadow) {
        (0, psdWriter_1.writeSignature)(writer, '8BIM');
        (0, psdWriter_1.writeSignature)(writer, 'dsdw');
        writeShadowInfo(writer, dropShadow);
    }
    if (innerShadow) {
        (0, psdWriter_1.writeSignature)(writer, '8BIM');
        (0, psdWriter_1.writeSignature)(writer, 'isdw');
        writeShadowInfo(writer, innerShadow);
    }
    if (outerGlow) {
        (0, psdWriter_1.writeSignature)(writer, '8BIM');
        (0, psdWriter_1.writeSignature)(writer, 'oglw');
        (0, psdWriter_1.writeUint32)(writer, 42);
        (0, psdWriter_1.writeUint32)(writer, 2);
        (0, psdWriter_1.writeFixedPoint32)(writer, ((_d = outerGlow.size) === null || _d === void 0 ? void 0 : _d.value) || 0);
        (0, psdWriter_1.writeFixedPoint32)(writer, 0); // intensity
        (0, psdWriter_1.writeColor)(writer, outerGlow.color);
        writeBlendMode(writer, outerGlow.blendMode);
        (0, psdWriter_1.writeUint8)(writer, outerGlow.enabled ? 1 : 0);
        writeFixedPoint8(writer, outerGlow.opacity || 0);
        (0, psdWriter_1.writeColor)(writer, outerGlow.color);
    }
    if (innerGlow) {
        (0, psdWriter_1.writeSignature)(writer, '8BIM');
        (0, psdWriter_1.writeSignature)(writer, 'iglw');
        (0, psdWriter_1.writeUint32)(writer, 43);
        (0, psdWriter_1.writeUint32)(writer, 2);
        (0, psdWriter_1.writeFixedPoint32)(writer, ((_e = innerGlow.size) === null || _e === void 0 ? void 0 : _e.value) || 0);
        (0, psdWriter_1.writeFixedPoint32)(writer, 0); // intensity
        (0, psdWriter_1.writeColor)(writer, innerGlow.color);
        writeBlendMode(writer, innerGlow.blendMode);
        (0, psdWriter_1.writeUint8)(writer, innerGlow.enabled ? 1 : 0);
        writeFixedPoint8(writer, innerGlow.opacity || 0);
        (0, psdWriter_1.writeUint8)(writer, 0); // inverted
        (0, psdWriter_1.writeColor)(writer, innerGlow.color);
    }
    if (bevel) {
        (0, psdWriter_1.writeSignature)(writer, '8BIM');
        (0, psdWriter_1.writeSignature)(writer, 'bevl');
        (0, psdWriter_1.writeUint32)(writer, 78);
        (0, psdWriter_1.writeUint32)(writer, 2);
        (0, psdWriter_1.writeFixedPoint32)(writer, bevel.angle || 0);
        (0, psdWriter_1.writeFixedPoint32)(writer, bevel.strength || 0);
        (0, psdWriter_1.writeFixedPoint32)(writer, ((_f = bevel.size) === null || _f === void 0 ? void 0 : _f.value) || 0);
        writeBlendMode(writer, bevel.highlightBlendMode);
        writeBlendMode(writer, bevel.shadowBlendMode);
        (0, psdWriter_1.writeColor)(writer, bevel.highlightColor);
        (0, psdWriter_1.writeColor)(writer, bevel.shadowColor);
        var style = bevelStyles.indexOf(bevel.style);
        (0, psdWriter_1.writeUint8)(writer, style <= 0 ? 1 : style);
        writeFixedPoint8(writer, bevel.highlightOpacity || 0);
        writeFixedPoint8(writer, bevel.shadowOpacity || 0);
        (0, psdWriter_1.writeUint8)(writer, bevel.enabled ? 1 : 0);
        (0, psdWriter_1.writeUint8)(writer, bevel.useGlobalLight ? 1 : 0);
        (0, psdWriter_1.writeUint8)(writer, bevel.direction === 'down' ? 1 : 0);
        (0, psdWriter_1.writeColor)(writer, bevel.highlightColor);
        (0, psdWriter_1.writeColor)(writer, bevel.shadowColor);
    }
    if (solidFill) {
        (0, psdWriter_1.writeSignature)(writer, '8BIM');
        (0, psdWriter_1.writeSignature)(writer, 'sofi');
        (0, psdWriter_1.writeUint32)(writer, 34);
        (0, psdWriter_1.writeUint32)(writer, 2);
        writeBlendMode(writer, solidFill.blendMode);
        (0, psdWriter_1.writeColor)(writer, solidFill.color);
        writeFixedPoint8(writer, solidFill.opacity || 0);
        (0, psdWriter_1.writeUint8)(writer, solidFill.enabled ? 1 : 0);
        (0, psdWriter_1.writeColor)(writer, solidFill.color);
    }
}
exports.writeEffects = writeEffects;

},{"./helpers":7,"./psdReader":11,"./psdWriter":12}],6:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeEngineData = exports.parseEngineData = void 0;
function isWhitespace(char) {
    // ' ', '\n', '\r', '\t'
    return char === 32 || char === 10 || char === 13 || char === 9;
}
function isNumber(char) {
    // 0123456789.-
    return (char >= 48 && char <= 57) || char === 46 || char === 45;
}
function parseEngineData(data) {
    var index = 0;
    function skipWhitespace() {
        while (index < data.length && isWhitespace(data[index])) {
            index++;
        }
    }
    function getTextByte() {
        var byte = data[index];
        index++;
        if (byte === 92) { // \
            byte = data[index];
            index++;
        }
        return byte;
    }
    function getText() {
        var result = '';
        if (data[index] === 41) { // )
            index++;
            return result;
        }
        // Strings start with utf-16 BOM
        if (data[index] !== 0xFE || data[index + 1] !== 0xFF) {
            throw new Error('Invalid utf-16 BOM');
        }
        index += 2;
        // ), ( and \ characters are escaped in ascii manner, remove the escapes before interpreting
        // the bytes as utf-16
        while (index < data.length && data[index] !== 41) { // )
            var high = getTextByte();
            var low = getTextByte();
            var char = (high << 8) | low;
            result += String.fromCharCode(char);
        }
        index++;
        return result;
    }
    var root = null;
    var stack = [];
    function pushContainer(value) {
        if (!stack.length) {
            stack.push(value);
            root = value;
        }
        else {
            pushValue(value);
            stack.push(value);
        }
    }
    function pushValue(value) {
        if (!stack.length)
            throw new Error('Invalid data');
        var top = stack[stack.length - 1];
        if (typeof top === 'string') {
            stack[stack.length - 2][top] = value;
            pop();
        }
        else if (Array.isArray(top)) {
            top.push(value);
        }
        else {
            throw new Error('Invalid data');
        }
    }
    function pushProperty(name) {
        if (!stack.length)
            pushContainer({});
        var top = stack[stack.length - 1];
        if (top && typeof top === 'string') {
            if (name === 'nil') {
                pushValue(null);
            }
            else {
                pushValue("/".concat(name));
            }
        }
        else if (top && typeof top === 'object') {
            stack.push(name);
        }
        else {
            throw new Error('Invalid data');
        }
    }
    function pop() {
        if (!stack.length)
            throw new Error('Invalid data');
        stack.pop();
    }
    skipWhitespace();
    while (index < data.length) {
        var i = index;
        var char = data[i];
        if (char === 60 && data[i + 1] === 60) { // <<
            index += 2;
            pushContainer({});
        }
        else if (char === 62 && data[i + 1] === 62) { // >>
            index += 2;
            pop();
        }
        else if (char === 47) { // /
            index += 1;
            var start = index;
            while (index < data.length && !isWhitespace(data[index])) {
                index++;
            }
            var name_1 = '';
            for (var i_1 = start; i_1 < index; i_1++) {
                name_1 += String.fromCharCode(data[i_1]);
            }
            pushProperty(name_1);
        }
        else if (char === 40) { // (
            index += 1;
            pushValue(getText());
        }
        else if (char === 91) { // [
            index += 1;
            pushContainer([]);
        }
        else if (char === 93) { // ]
            index += 1;
            pop();
        }
        else if (char === 110 && data[i + 1] === 117 && data[i + 2] === 108 && data[i + 3] === 108) { // null
            index += 4;
            pushValue(null);
        }
        else if (char === 116 && data[i + 1] === 114 && data[i + 2] === 117 && data[i + 3] === 101) { // true
            index += 4;
            pushValue(true);
        }
        else if (char === 102 && data[i + 1] === 97 && data[i + 2] === 108 && data[i + 3] === 115 && data[i + 4] === 101) { // false
            index += 5;
            pushValue(false);
        }
        else if (isNumber(char)) {
            var value = '';
            while (index < data.length && isNumber(data[index])) {
                value += String.fromCharCode(data[index]);
                index++;
            }
            pushValue(parseFloat(value));
        }
        else {
            index += 1;
            console.log("Invalid token ".concat(String.fromCharCode(char), " at ").concat(index));
            // ` near ${String.fromCharCode.apply(null, data.slice(index - 10, index + 20) as any)}` +
            // `data [${Array.from(data.slice(index - 10, index + 20)).join(', ')}]`
        }
        skipWhitespace();
    }
    return root;
}
exports.parseEngineData = parseEngineData;
var floatKeys = [
    'Axis', 'XY', 'Zone', 'WordSpacing', 'FirstLineIndent', 'GlyphSpacing', 'StartIndent', 'EndIndent', 'SpaceBefore',
    'SpaceAfter', 'LetterSpacing', 'Values', 'GridSize', 'GridLeading', 'PointBase', 'BoxBounds', 'TransformPoint0', 'TransformPoint1',
    'TransformPoint2', 'FontSize', 'Leading', 'HorizontalScale', 'VerticalScale', 'BaselineShift', 'Tsume',
    'OutlineWidth', 'AutoLeading',
];
var intArrays = ['RunLengthArray'];
// TODO: handle /nil
function serializeEngineData(data, condensed) {
    if (condensed === void 0) { condensed = false; }
    var buffer = new Uint8Array(1024);
    var offset = 0;
    var indent = 0;
    function write(value) {
        if (offset >= buffer.length) {
            var newBuffer = new Uint8Array(buffer.length * 2);
            newBuffer.set(buffer);
            buffer = newBuffer;
        }
        buffer[offset] = value;
        offset++;
    }
    function writeString(value) {
        for (var i = 0; i < value.length; i++) {
            write(value.charCodeAt(i));
        }
    }
    function writeIndent() {
        if (condensed) {
            writeString(' ');
        }
        else {
            for (var i = 0; i < indent; i++) {
                writeString('\t');
            }
        }
    }
    function writeProperty(key, value) {
        writeIndent();
        writeString("/".concat(key));
        writeValue(value, key, true);
        if (!condensed)
            writeString('\n');
    }
    function serializeInt(value) {
        return value.toString();
    }
    function serializeFloat(value) {
        return value.toFixed(5)
            .replace(/(\d)0+$/g, '$1')
            .replace(/^0+\.([1-9])/g, '.$1')
            .replace(/^-0+\.0(\d)/g, '-.0$1');
    }
    function serializeNumber(value, key) {
        var isFloat = (key && floatKeys.indexOf(key) !== -1) || (value | 0) !== value;
        return isFloat ? serializeFloat(value) : serializeInt(value);
    }
    function getKeys(value) {
        var keys = Object.keys(value);
        if (keys.indexOf('98') !== -1)
            keys.unshift.apply(keys, keys.splice(keys.indexOf('99'), 1));
        if (keys.indexOf('99') !== -1)
            keys.unshift.apply(keys, keys.splice(keys.indexOf('99'), 1));
        return keys;
    }
    function writeStringByte(value) {
        if (value === 40 || value === 41 || value === 92) { // ( ) \
            write(92); // \
        }
        write(value);
    }
    function writeValue(value, key, inProperty) {
        if (inProperty === void 0) { inProperty = false; }
        function writePrefix() {
            if (inProperty) {
                writeString(' ');
            }
            else {
                writeIndent();
            }
        }
        if (value === null) {
            writePrefix();
            writeString(condensed ? '/nil' : 'null');
        }
        else if (typeof value === 'number') {
            writePrefix();
            writeString(serializeNumber(value, key));
        }
        else if (typeof value === 'boolean') {
            writePrefix();
            writeString(value ? 'true' : 'false');
        }
        else if (typeof value === 'string') {
            writePrefix();
            if ((key === '99' || key === '98') && value.charAt(0) === '/') {
                writeString(value);
            }
            else {
                writeString('(');
                write(0xfe);
                write(0xff);
                for (var i = 0; i < value.length; i++) {
                    var code = value.charCodeAt(i);
                    writeStringByte((code >> 8) & 0xff);
                    writeStringByte(code & 0xff);
                }
                writeString(')');
            }
        }
        else if (Array.isArray(value)) {
            writePrefix();
            if (value.every(function (x) { return typeof x === 'number'; })) {
                writeString('[');
                var intArray = intArrays.indexOf(key) !== -1;
                for (var _i = 0, value_1 = value; _i < value_1.length; _i++) {
                    var x = value_1[_i];
                    writeString(' ');
                    writeString(intArray ? serializeNumber(x) : serializeFloat(x));
                }
                writeString(' ]');
            }
            else {
                writeString('[');
                if (!condensed)
                    writeString('\n');
                for (var _a = 0, value_2 = value; _a < value_2.length; _a++) {
                    var x = value_2[_a];
                    writeValue(x, key);
                    if (!condensed)
                        writeString('\n');
                }
                writeIndent();
                writeString(']');
            }
        }
        else if (typeof value === 'object') {
            if (inProperty && !condensed)
                writeString('\n');
            writeIndent();
            writeString('<<');
            if (!condensed)
                writeString('\n');
            indent++;
            for (var _b = 0, _c = getKeys(value); _b < _c.length; _b++) {
                var key_1 = _c[_b];
                writeProperty(key_1, value[key_1]);
            }
            indent--;
            writeIndent();
            writeString('>>');
        }
        return undefined;
    }
    if (condensed) {
        if (typeof data === 'object') {
            for (var _i = 0, _a = getKeys(data); _i < _a.length; _i++) {
                var key = _a[_i];
                writeProperty(key, data[key]);
            }
        }
    }
    else {
        writeString('\n\n');
        writeValue(data);
    }
    return buffer.slice(0, offset);
}
exports.serializeEngineData = serializeEngineData;

},{}],7:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeCanvas = exports.createImageData = exports.createCanvasFromData = exports.createCanvas = exports.writeDataZipWithoutPrediction = exports.writeDataRLE = exports.writeDataRaw = exports.decodeBitmap = exports.imageDataToCanvas = exports.resetImageData = exports.hasAlpha = exports.clamp = exports.offsetForChannel = exports.Compression = exports.ChannelID = exports.MaskParams = exports.LayerMaskFlags = exports.ColorSpace = exports.createEnum = exports.revMap = exports.largeAdditionalInfoKeys = exports.layerColors = exports.toBlendMode = exports.fromBlendMode = exports.RAW_IMAGE_DATA = exports.MOCK_HANDLERS = void 0;
var base64_js_1 = require("base64-js");
var zlib_1 = require("zlib");
exports.MOCK_HANDLERS = false;
exports.RAW_IMAGE_DATA = false;
exports.fromBlendMode = {};
exports.toBlendMode = {
    'pass': 'pass through',
    'norm': 'normal',
    'diss': 'dissolve',
    'dark': 'darken',
    'mul ': 'multiply',
    'idiv': 'color burn',
    'lbrn': 'linear burn',
    'dkCl': 'darker color',
    'lite': 'lighten',
    'scrn': 'screen',
    'div ': 'color dodge',
    'lddg': 'linear dodge',
    'lgCl': 'lighter color',
    'over': 'overlay',
    'sLit': 'soft light',
    'hLit': 'hard light',
    'vLit': 'vivid light',
    'lLit': 'linear light',
    'pLit': 'pin light',
    'hMix': 'hard mix',
    'diff': 'difference',
    'smud': 'exclusion',
    'fsub': 'subtract',
    'fdiv': 'divide',
    'hue ': 'hue',
    'sat ': 'saturation',
    'colr': 'color',
    'lum ': 'luminosity',
};
Object.keys(exports.toBlendMode).forEach(function (key) { return exports.fromBlendMode[exports.toBlendMode[key]] = key; });
exports.layerColors = [
    'none', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'gray'
];
exports.largeAdditionalInfoKeys = [
    // from documentation
    'LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk', 'lnk2', 'FEid', 'FXid', 'PxSD',
    // from guessing
    'cinf',
];
function revMap(map) {
    var result = {};
    Object.keys(map).forEach(function (key) { return result[map[key]] = key; });
    return result;
}
exports.revMap = revMap;
function createEnum(prefix, def, map) {
    var rev = revMap(map);
    var decode = function (val) {
        var value = val.split('.')[1];
        if (value && !rev[value])
            throw new Error("Unrecognized value for enum: '".concat(val, "'"));
        return rev[value] || def;
    };
    var encode = function (val) {
        if (val && !map[val])
            throw new Error("Invalid value for enum: '".concat(val, "'"));
        return "".concat(prefix, ".").concat(map[val] || map[def]);
    };
    return { decode: decode, encode: encode };
}
exports.createEnum = createEnum;
var ColorSpace;
(function (ColorSpace) {
    ColorSpace[ColorSpace["RGB"] = 0] = "RGB";
    ColorSpace[ColorSpace["HSB"] = 1] = "HSB";
    ColorSpace[ColorSpace["CMYK"] = 2] = "CMYK";
    ColorSpace[ColorSpace["Lab"] = 7] = "Lab";
    ColorSpace[ColorSpace["Grayscale"] = 8] = "Grayscale";
})(ColorSpace = exports.ColorSpace || (exports.ColorSpace = {}));
var LayerMaskFlags;
(function (LayerMaskFlags) {
    LayerMaskFlags[LayerMaskFlags["PositionRelativeToLayer"] = 1] = "PositionRelativeToLayer";
    LayerMaskFlags[LayerMaskFlags["LayerMaskDisabled"] = 2] = "LayerMaskDisabled";
    LayerMaskFlags[LayerMaskFlags["InvertLayerMaskWhenBlending"] = 4] = "InvertLayerMaskWhenBlending";
    LayerMaskFlags[LayerMaskFlags["LayerMaskFromRenderingOtherData"] = 8] = "LayerMaskFromRenderingOtherData";
    LayerMaskFlags[LayerMaskFlags["MaskHasParametersAppliedToIt"] = 16] = "MaskHasParametersAppliedToIt";
})(LayerMaskFlags = exports.LayerMaskFlags || (exports.LayerMaskFlags = {}));
var MaskParams;
(function (MaskParams) {
    MaskParams[MaskParams["UserMaskDensity"] = 1] = "UserMaskDensity";
    MaskParams[MaskParams["UserMaskFeather"] = 2] = "UserMaskFeather";
    MaskParams[MaskParams["VectorMaskDensity"] = 4] = "VectorMaskDensity";
    MaskParams[MaskParams["VectorMaskFeather"] = 8] = "VectorMaskFeather";
})(MaskParams = exports.MaskParams || (exports.MaskParams = {}));
var ChannelID;
(function (ChannelID) {
    ChannelID[ChannelID["Color0"] = 0] = "Color0";
    ChannelID[ChannelID["Color1"] = 1] = "Color1";
    ChannelID[ChannelID["Color2"] = 2] = "Color2";
    ChannelID[ChannelID["Color3"] = 3] = "Color3";
    ChannelID[ChannelID["Transparency"] = -1] = "Transparency";
    ChannelID[ChannelID["UserMask"] = -2] = "UserMask";
    ChannelID[ChannelID["RealUserMask"] = -3] = "RealUserMask";
})(ChannelID = exports.ChannelID || (exports.ChannelID = {}));
var Compression;
(function (Compression) {
    Compression[Compression["RawData"] = 0] = "RawData";
    Compression[Compression["RleCompressed"] = 1] = "RleCompressed";
    Compression[Compression["ZipWithoutPrediction"] = 2] = "ZipWithoutPrediction";
    Compression[Compression["ZipWithPrediction"] = 3] = "ZipWithPrediction";
})(Compression = exports.Compression || (exports.Compression = {}));
function offsetForChannel(channelId, cmyk) {
    switch (channelId) {
        case 0 /* ChannelID.Color0 */: return 0;
        case 1 /* ChannelID.Color1 */: return 1;
        case 2 /* ChannelID.Color2 */: return 2;
        case 3 /* ChannelID.Color3 */: return cmyk ? 3 : channelId + 1;
        case -1 /* ChannelID.Transparency */: return cmyk ? 4 : 3;
        default: return channelId + 1;
    }
}
exports.offsetForChannel = offsetForChannel;
function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
}
exports.clamp = clamp;
function hasAlpha(data) {
    var size = data.width * data.height * 4;
    for (var i = 3; i < size; i += 4) {
        if (data.data[i] !== 255) {
            return true;
        }
    }
    return false;
}
exports.hasAlpha = hasAlpha;
function resetImageData(_a) {
    var data = _a.data;
    var alpha = (data instanceof Float32Array) ? 1.0 : ((data instanceof Uint16Array) ? 0xffff : 0xff);
    for (var p = 0, size = data.length | 0; p < size; p = (p + 4) | 0) {
        data[p + 0] = 0;
        data[p + 1] = 0;
        data[p + 2] = 0;
        data[p + 3] = alpha;
    }
}
exports.resetImageData = resetImageData;
function imageDataToCanvas(pixelData) {
    var canvas = (0, exports.createCanvas)(pixelData.width, pixelData.height);
    var imageData;
    if (pixelData.data instanceof Uint8ClampedArray) {
        imageData = pixelData;
    }
    else {
        imageData = (0, exports.createImageData)(pixelData.width, pixelData.height);
        var src = pixelData.data;
        var dst = imageData.data;
        if (src instanceof Float32Array) {
            for (var i = 0, size = src.length; i < size; i += 4) {
                dst[i + 0] = Math.round(Math.pow(src[i + 0], 1.0 / 2.2) * 255);
                dst[i + 1] = Math.round(Math.pow(src[i + 1], 1.0 / 2.2) * 255);
                dst[i + 2] = Math.round(Math.pow(src[i + 2], 1.0 / 2.2) * 255);
                dst[i + 3] = Math.round(src[i + 3] * 255);
            }
        }
        else {
            var shift = (src instanceof Uint16Array) ? 8 : 0;
            for (var i = 0, size = src.length; i < size; i++) {
                dst[i] = src[i] >>> shift;
            }
        }
    }
    canvas.getContext('2d').putImageData(imageData, 0, 0);
    return canvas;
}
exports.imageDataToCanvas = imageDataToCanvas;
function decodeBitmap(input, output, width, height) {
    if (!(input instanceof Uint8Array || input instanceof Uint8ClampedArray))
        throw new Error('Invalid bit depth');
    for (var y = 0, p = 0, o = 0; y < height; y++) {
        for (var x = 0; x < width;) {
            var b = input[o++];
            for (var i = 0; i < 8 && x < width; i++, x++, p += 4) {
                var v = b & 0x80 ? 0 : 255;
                b = b << 1;
                output[p + 0] = v;
                output[p + 1] = v;
                output[p + 2] = v;
                output[p + 3] = 255;
            }
        }
    }
}
exports.decodeBitmap = decodeBitmap;
function writeDataRaw(data, offset, width, height) {
    if (!width || !height)
        return undefined;
    var array = new Uint8Array(width * height);
    for (var i = 0; i < array.length; i++) {
        array[i] = data.data[i * 4 + offset];
    }
    return array;
}
exports.writeDataRaw = writeDataRaw;
function writeDataRLE(buffer, _a, offsets, large) {
    var data = _a.data, width = _a.width, height = _a.height;
    if (!width || !height)
        return undefined;
    var stride = (4 * width) | 0;
    var ol = 0;
    var o = (offsets.length * (large ? 4 : 2) * height) | 0;
    for (var _i = 0, offsets_1 = offsets; _i < offsets_1.length; _i++) {
        var offset = offsets_1[_i];
        for (var y = 0, p = offset | 0; y < height; y++) {
            var strideStart = (y * stride) | 0;
            var strideEnd = (strideStart + stride) | 0;
            var lastIndex = (strideEnd + offset - 4) | 0;
            var lastIndex2 = (lastIndex - 4) | 0;
            var startOffset = o;
            for (p = (strideStart + offset) | 0; p < strideEnd; p = (p + 4) | 0) {
                if (p < lastIndex2) {
                    var value1 = data[p];
                    p = (p + 4) | 0;
                    var value2 = data[p];
                    p = (p + 4) | 0;
                    var value3 = data[p];
                    if (value1 === value2 && value1 === value3) {
                        var count = 3;
                        while (count < 128 && p < lastIndex && data[(p + 4) | 0] === value1) {
                            count = (count + 1) | 0;
                            p = (p + 4) | 0;
                        }
                        buffer[o++] = 1 - count;
                        buffer[o++] = value1;
                    }
                    else {
                        var countIndex = o;
                        var writeLast = true;
                        var count = 1;
                        buffer[o++] = 0;
                        buffer[o++] = value1;
                        while (p < lastIndex && count < 128) {
                            p = (p + 4) | 0;
                            value1 = value2;
                            value2 = value3;
                            value3 = data[p];
                            if (value1 === value2 && value1 === value3) {
                                p = (p - 12) | 0;
                                writeLast = false;
                                break;
                            }
                            else {
                                count++;
                                buffer[o++] = value1;
                            }
                        }
                        if (writeLast) {
                            if (count < 127) {
                                buffer[o++] = value2;
                                buffer[o++] = value3;
                                count += 2;
                            }
                            else if (count < 128) {
                                buffer[o++] = value2;
                                count++;
                                p = (p - 4) | 0;
                            }
                            else {
                                p = (p - 8) | 0;
                            }
                        }
                        buffer[countIndex] = count - 1;
                    }
                }
                else if (p === lastIndex) {
                    buffer[o++] = 0;
                    buffer[o++] = data[p];
                }
                else { // p === lastIndex2
                    buffer[o++] = 1;
                    buffer[o++] = data[p];
                    p = (p + 4) | 0;
                    buffer[o++] = data[p];
                }
            }
            var length_1 = o - startOffset;
            if (large) {
                buffer[ol++] = (length_1 >> 24) & 0xff;
                buffer[ol++] = (length_1 >> 16) & 0xff;
            }
            buffer[ol++] = (length_1 >> 8) & 0xff;
            buffer[ol++] = length_1 & 0xff;
        }
    }
    return buffer.slice(0, o);
}
exports.writeDataRLE = writeDataRLE;
function writeDataZipWithoutPrediction(_a, offsets) {
    var data = _a.data, width = _a.width, height = _a.height;
    var size = width * height;
    var channel = new Uint8Array(size);
    var buffers = [];
    var totalLength = 0;
    for (var _i = 0, offsets_2 = offsets; _i < offsets_2.length; _i++) {
        var offset = offsets_2[_i];
        for (var i = 0, o = offset; i < size; i++, o += 4) {
            channel[i] = data[o];
        }
        var buffer = (0, zlib_1.deflateSync)(channel);
        buffers.push(buffer);
        totalLength += buffer.byteLength;
    }
    if (buffers.length > 0) {
        var buffer = new Uint8Array(totalLength);
        var offset = 0;
        for (var _b = 0, buffers_1 = buffers; _b < buffers_1.length; _b++) {
            var b = buffers_1[_b];
            buffer.set(b, offset);
            offset += b.byteLength;
        }
        return buffer;
    }
    else {
        return buffers[0];
    }
}
exports.writeDataZipWithoutPrediction = writeDataZipWithoutPrediction;
var createCanvas = function () {
    throw new Error('Canvas not initialized, use initializeCanvas method to set up createCanvas method');
};
exports.createCanvas = createCanvas;
var createCanvasFromData = function () {
    throw new Error('Canvas not initialized, use initializeCanvas method to set up createCanvasFromData method');
};
exports.createCanvasFromData = createCanvasFromData;
var tempCanvas = undefined;
var createImageData = function (width, height) {
    if (!tempCanvas)
        tempCanvas = (0, exports.createCanvas)(1, 1);
    return tempCanvas.getContext('2d').createImageData(width, height);
};
exports.createImageData = createImageData;
if (typeof document !== 'undefined') {
    exports.createCanvas = function (width, height) {
        var canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
    };
    exports.createCanvasFromData = function (data) {
        var image = new Image();
        image.src = 'data:image/jpeg;base64,' + (0, base64_js_1.fromByteArray)(data);
        var canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext('2d').drawImage(image, 0, 0);
        return canvas;
    };
}
function initializeCanvas(createCanvasMethod, createCanvasFromDataMethod, createImageDataMethod) {
    exports.createCanvas = createCanvasMethod;
    exports.createCanvasFromData = createCanvasFromDataMethod || exports.createCanvasFromData;
    exports.createImageData = createImageDataMethod || exports.createImageData;
}
exports.initializeCanvas = initializeCanvas;

},{"base64-js":21,"zlib":24}],8:[function(require,module,exports){
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resourceHandlersMap = exports.resourceHandlers = void 0;
var base64_js_1 = require("base64-js");
var psdReader_1 = require("./psdReader");
var psdWriter_1 = require("./psdWriter");
var helpers_1 = require("./helpers");
var utf8_1 = require("./utf8");
var descriptor_1 = require("./descriptor");
exports.resourceHandlers = [];
exports.resourceHandlersMap = {};
function addHandler(key, has, read, write) {
    var handler = { key: key, has: has, read: read, write: write };
    exports.resourceHandlers.push(handler);
    exports.resourceHandlersMap[handler.key] = handler;
}
var LOG_MOCK_HANDLERS = false;
var RESOLUTION_UNITS = [undefined, 'PPI', 'PPCM'];
var MEASUREMENT_UNITS = [undefined, 'Inches', 'Centimeters', 'Points', 'Picas', 'Columns'];
var hex = '0123456789abcdef';
function charToNibble(code) {
    return code <= 57 ? code - 48 : code - 87;
}
function byteAt(value, index) {
    return (charToNibble(value.charCodeAt(index)) << 4) | charToNibble(value.charCodeAt(index + 1));
}
function readUtf8String(reader, length) {
    var buffer = (0, psdReader_1.readBytes)(reader, length);
    return (0, utf8_1.decodeString)(buffer);
}
function writeUtf8String(writer, value) {
    var buffer = (0, utf8_1.encodeString)(value);
    (0, psdWriter_1.writeBytes)(writer, buffer);
}
helpers_1.MOCK_HANDLERS && addHandler(1028, // IPTC-NAA record
function (// IPTC-NAA record
target) { return target._ir1028 !== undefined; }, function (reader, target, left) {
    LOG_MOCK_HANDLERS && console.log('image resource 1028', left());
    target._ir1028 = (0, psdReader_1.readBytes)(reader, left());
}, function (writer, target) {
    (0, psdWriter_1.writeBytes)(writer, target._ir1028);
});
addHandler(1061, function (target) { return target.captionDigest !== undefined; }, function (reader, target) {
    var captionDigest = '';
    for (var i = 0; i < 16; i++) {
        var byte = (0, psdReader_1.readUint8)(reader);
        captionDigest += hex[byte >> 4];
        captionDigest += hex[byte & 0xf];
    }
    target.captionDigest = captionDigest;
}, function (writer, target) {
    for (var i = 0; i < 16; i++) {
        (0, psdWriter_1.writeUint8)(writer, byteAt(target.captionDigest, i * 2));
    }
});
addHandler(1060, function (target) { return target.xmpMetadata !== undefined; }, function (reader, target, left) {
    target.xmpMetadata = readUtf8String(reader, left());
}, function (writer, target) {
    writeUtf8String(writer, target.xmpMetadata);
});
var Inte = (0, helpers_1.createEnum)('Inte', 'perceptual', {
    'perceptual': 'Img ',
    'saturation': 'Grp ',
    'relative colorimetric': 'Clrm',
    'absolute colorimetric': 'AClr',
});
addHandler(1082, function (target) { return target.printInformation !== undefined; }, function (reader, target) {
    var _a, _b;
    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
    target.printInformation = {
        printerName: desc.printerName || '',
        renderingIntent: Inte.decode((_a = desc.Inte) !== null && _a !== void 0 ? _a : 'Inte.Img '),
    };
    var info = target.printInformation;
    if (desc.PstS !== undefined)
        info.printerManagesColors = desc.PstS;
    if (desc['Nm  '] !== undefined)
        info.printerProfile = desc['Nm  '];
    if (desc.MpBl !== undefined)
        info.blackPointCompensation = desc.MpBl;
    if (desc.printSixteenBit !== undefined)
        info.printSixteenBit = desc.printSixteenBit;
    if (desc.hardProof !== undefined)
        info.hardProof = desc.hardProof;
    if (desc.printProofSetup) {
        if ('Bltn' in desc.printProofSetup) {
            info.proofSetup = { builtin: desc.printProofSetup.Bltn.split('.')[1] };
        }
        else {
            info.proofSetup = {
                profile: desc.printProofSetup.profile,
                renderingIntent: Inte.decode((_b = desc.printProofSetup.Inte) !== null && _b !== void 0 ? _b : 'Inte.Img '),
                blackPointCompensation: !!desc.printProofSetup.MpBl,
                paperWhite: !!desc.printProofSetup.paperWhite,
            };
        }
    }
}, function (writer, target) {
    var _a, _b;
    var info = target.printInformation;
    var desc = {};
    if (info.printerManagesColors) {
        desc.PstS = true;
    }
    else {
        if (info.hardProof !== undefined)
            desc.hardProof = !!info.hardProof;
        desc.ClrS = 'ClrS.RGBC'; // TODO: ???
        desc['Nm  '] = (_a = info.printerProfile) !== null && _a !== void 0 ? _a : 'CIE RGB';
    }
    desc.Inte = Inte.encode(info.renderingIntent);
    if (!info.printerManagesColors)
        desc.MpBl = !!info.blackPointCompensation;
    desc.printSixteenBit = !!info.printSixteenBit;
    desc.printerName = info.printerName || '';
    if (info.proofSetup && 'profile' in info.proofSetup) {
        desc.printProofSetup = {
            profile: info.proofSetup.profile || '',
            Inte: Inte.encode(info.proofSetup.renderingIntent),
            MpBl: !!info.proofSetup.blackPointCompensation,
            paperWhite: !!info.proofSetup.paperWhite,
        };
    }
    else {
        desc.printProofSetup = {
            Bltn: ((_b = info.proofSetup) === null || _b === void 0 ? void 0 : _b.builtin) ? "builtinProof.".concat(info.proofSetup.builtin) : 'builtinProof.proofCMYK',
        };
    }
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'printOutput', desc);
});
helpers_1.MOCK_HANDLERS && addHandler(1083, // Print style
function (// Print style
target) { return target._ir1083 !== undefined; }, function (reader, target, left) {
    LOG_MOCK_HANDLERS && console.log('image resource 1083', left());
    target._ir1083 = (0, psdReader_1.readBytes)(reader, left());
    // TODO:
    // const desc = readVersionAndDescriptor(reader);
    // console.log('1083', require('util').inspect(desc, false, 99, true));
}, function (writer, target) {
    (0, psdWriter_1.writeBytes)(writer, target._ir1083);
});
addHandler(1005, function (target) { return target.resolutionInfo !== undefined; }, function (reader, target) {
    var horizontalResolution = (0, psdReader_1.readFixedPoint32)(reader);
    var horizontalResolutionUnit = (0, psdReader_1.readUint16)(reader);
    var widthUnit = (0, psdReader_1.readUint16)(reader);
    var verticalResolution = (0, psdReader_1.readFixedPoint32)(reader);
    var verticalResolutionUnit = (0, psdReader_1.readUint16)(reader);
    var heightUnit = (0, psdReader_1.readUint16)(reader);
    target.resolutionInfo = {
        horizontalResolution: horizontalResolution,
        horizontalResolutionUnit: RESOLUTION_UNITS[horizontalResolutionUnit] || 'PPI',
        widthUnit: MEASUREMENT_UNITS[widthUnit] || 'Inches',
        verticalResolution: verticalResolution,
        verticalResolutionUnit: RESOLUTION_UNITS[verticalResolutionUnit] || 'PPI',
        heightUnit: MEASUREMENT_UNITS[heightUnit] || 'Inches',
    };
}, function (writer, target) {
    var info = target.resolutionInfo;
    (0, psdWriter_1.writeFixedPoint32)(writer, info.horizontalResolution || 0);
    (0, psdWriter_1.writeUint16)(writer, Math.max(1, RESOLUTION_UNITS.indexOf(info.horizontalResolutionUnit)));
    (0, psdWriter_1.writeUint16)(writer, Math.max(1, MEASUREMENT_UNITS.indexOf(info.widthUnit)));
    (0, psdWriter_1.writeFixedPoint32)(writer, info.verticalResolution || 0);
    (0, psdWriter_1.writeUint16)(writer, Math.max(1, RESOLUTION_UNITS.indexOf(info.verticalResolutionUnit)));
    (0, psdWriter_1.writeUint16)(writer, Math.max(1, MEASUREMENT_UNITS.indexOf(info.heightUnit)));
});
var printScaleStyles = ['centered', 'size to fit', 'user defined'];
addHandler(1062, function (target) { return target.printScale !== undefined; }, function (reader, target) {
    target.printScale = {
        style: printScaleStyles[(0, psdReader_1.readInt16)(reader)],
        x: (0, psdReader_1.readFloat32)(reader),
        y: (0, psdReader_1.readFloat32)(reader),
        scale: (0, psdReader_1.readFloat32)(reader),
    };
}, function (writer, target) {
    var _a = target.printScale, style = _a.style, x = _a.x, y = _a.y, scale = _a.scale;
    (0, psdWriter_1.writeInt16)(writer, Math.max(0, printScaleStyles.indexOf(style)));
    (0, psdWriter_1.writeFloat32)(writer, x || 0);
    (0, psdWriter_1.writeFloat32)(writer, y || 0);
    (0, psdWriter_1.writeFloat32)(writer, scale || 0);
});
addHandler(1006, function (target) { return target.alphaChannelNames !== undefined; }, function (reader, target, left) {
    target.alphaChannelNames = [];
    while (left()) {
        var value = (0, psdReader_1.readPascalString)(reader, 1);
        target.alphaChannelNames.push(value);
    }
}, function (writer, target) {
    for (var _i = 0, _a = target.alphaChannelNames; _i < _a.length; _i++) {
        var name_1 = _a[_i];
        (0, psdWriter_1.writePascalString)(writer, name_1, 1);
    }
});
addHandler(1045, function (target) { return target.alphaChannelNames !== undefined; }, function (reader, target, left) {
    target.alphaChannelNames = [];
    while (left()) {
        target.alphaChannelNames.push((0, psdReader_1.readUnicodeString)(reader));
    }
}, function (writer, target) {
    for (var _i = 0, _a = target.alphaChannelNames; _i < _a.length; _i++) {
        var name_2 = _a[_i];
        (0, psdWriter_1.writeUnicodeStringWithPadding)(writer, name_2);
    }
});
helpers_1.MOCK_HANDLERS && addHandler(1077, function (target) { return target._ir1077 !== undefined; }, function (reader, target, left) {
    LOG_MOCK_HANDLERS && console.log('image resource 1077', left());
    target._ir1077 = (0, psdReader_1.readBytes)(reader, left());
}, function (writer, target) {
    (0, psdWriter_1.writeBytes)(writer, target._ir1077);
});
addHandler(1053, function (target) { return target.alphaIdentifiers !== undefined; }, function (reader, target, left) {
    target.alphaIdentifiers = [];
    while (left() >= 4) {
        target.alphaIdentifiers.push((0, psdReader_1.readUint32)(reader));
    }
}, function (writer, target) {
    for (var _i = 0, _a = target.alphaIdentifiers; _i < _a.length; _i++) {
        var id = _a[_i];
        (0, psdWriter_1.writeUint32)(writer, id);
    }
});
addHandler(1010, function (target) { return target.backgroundColor !== undefined; }, function (reader, target) { return target.backgroundColor = (0, psdReader_1.readColor)(reader); }, function (writer, target) { return (0, psdWriter_1.writeColor)(writer, target.backgroundColor); });
addHandler(1037, function (target) { return target.globalAngle !== undefined; }, function (reader, target) { return target.globalAngle = (0, psdReader_1.readUint32)(reader); }, function (writer, target) { return (0, psdWriter_1.writeUint32)(writer, target.globalAngle); });
addHandler(1049, function (target) { return target.globalAltitude !== undefined; }, function (reader, target) { return target.globalAltitude = (0, psdReader_1.readUint32)(reader); }, function (writer, target) { return (0, psdWriter_1.writeUint32)(writer, target.globalAltitude); });
addHandler(1011, function (target) { return target.printFlags !== undefined; }, function (reader, target) {
    target.printFlags = {
        labels: !!(0, psdReader_1.readUint8)(reader),
        cropMarks: !!(0, psdReader_1.readUint8)(reader),
        colorBars: !!(0, psdReader_1.readUint8)(reader),
        registrationMarks: !!(0, psdReader_1.readUint8)(reader),
        negative: !!(0, psdReader_1.readUint8)(reader),
        flip: !!(0, psdReader_1.readUint8)(reader),
        interpolate: !!(0, psdReader_1.readUint8)(reader),
        caption: !!(0, psdReader_1.readUint8)(reader),
        printFlags: !!(0, psdReader_1.readUint8)(reader),
    };
}, function (writer, target) {
    var flags = target.printFlags;
    (0, psdWriter_1.writeUint8)(writer, flags.labels ? 1 : 0);
    (0, psdWriter_1.writeUint8)(writer, flags.cropMarks ? 1 : 0);
    (0, psdWriter_1.writeUint8)(writer, flags.colorBars ? 1 : 0);
    (0, psdWriter_1.writeUint8)(writer, flags.registrationMarks ? 1 : 0);
    (0, psdWriter_1.writeUint8)(writer, flags.negative ? 1 : 0);
    (0, psdWriter_1.writeUint8)(writer, flags.flip ? 1 : 0);
    (0, psdWriter_1.writeUint8)(writer, flags.interpolate ? 1 : 0);
    (0, psdWriter_1.writeUint8)(writer, flags.caption ? 1 : 0);
    (0, psdWriter_1.writeUint8)(writer, flags.printFlags ? 1 : 0);
});
helpers_1.MOCK_HANDLERS && addHandler(10000, // Print flags
function (// Print flags
target) { return target._ir10000 !== undefined; }, function (reader, target, left) {
    LOG_MOCK_HANDLERS && console.log('image resource 10000', left());
    target._ir10000 = (0, psdReader_1.readBytes)(reader, left());
}, function (writer, target) {
    (0, psdWriter_1.writeBytes)(writer, target._ir10000);
});
helpers_1.MOCK_HANDLERS && addHandler(1013, // Color halftoning
function (// Color halftoning
target) { return target._ir1013 !== undefined; }, function (reader, target, left) {
    LOG_MOCK_HANDLERS && console.log('image resource 1013', left());
    target._ir1013 = (0, psdReader_1.readBytes)(reader, left());
}, function (writer, target) {
    (0, psdWriter_1.writeBytes)(writer, target._ir1013);
});
helpers_1.MOCK_HANDLERS && addHandler(1016, // Color transfer functions
function (// Color transfer functions
target) { return target._ir1016 !== undefined; }, function (reader, target, left) {
    LOG_MOCK_HANDLERS && console.log('image resource 1016', left());
    target._ir1016 = (0, psdReader_1.readBytes)(reader, left());
}, function (writer, target) {
    (0, psdWriter_1.writeBytes)(writer, target._ir1016);
});
addHandler(1080, // Count Information
function (// Count Information
target) { return target.countInformation !== undefined; }, function (reader, target) {
    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
    target.countInformation = desc.countGroupList.map(function (g) { return ({
        color: { r: g['Rd  '], g: g['Grn '], b: g['Bl  '] },
        name: g['Nm  '],
        size: g['Rds '],
        fontSize: g.fontSize,
        visible: g.Vsbl,
        points: g.countObjectList.map(function (p) { return ({ x: p['X   '], y: p['Y   '] }); }),
    }); });
}, function (writer, target) {
    var desc = {
        Vrsn: 1,
        countGroupList: target.countInformation.map(function (g) { return ({
            'Rd  ': g.color.r,
            'Grn ': g.color.g,
            'Bl  ': g.color.b,
            'Nm  ': g.name,
            'Rds ': g.size,
            fontSize: g.fontSize,
            Vsbl: g.visible,
            countObjectList: g.points.map(function (p) { return ({ 'X   ': p.x, 'Y   ': p.y }); }),
        }); }),
    };
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'Cnt ', desc);
});
addHandler(1024, function (target) { return target.layerState !== undefined; }, function (reader, target) { return target.layerState = (0, psdReader_1.readUint16)(reader); }, function (writer, target) { return (0, psdWriter_1.writeUint16)(writer, target.layerState); });
addHandler(1026, function (target) { return target.layersGroup !== undefined; }, function (reader, target, left) {
    target.layersGroup = [];
    while (left()) {
        target.layersGroup.push((0, psdReader_1.readUint16)(reader));
    }
}, function (writer, target) {
    for (var _i = 0, _a = target.layersGroup; _i < _a.length; _i++) {
        var g = _a[_i];
        (0, psdWriter_1.writeUint16)(writer, g);
    }
});
addHandler(1072, function (target) { return target.layerGroupsEnabledId !== undefined; }, function (reader, target, left) {
    target.layerGroupsEnabledId = [];
    while (left()) {
        target.layerGroupsEnabledId.push((0, psdReader_1.readUint8)(reader));
    }
}, function (writer, target) {
    for (var _i = 0, _a = target.layerGroupsEnabledId; _i < _a.length; _i++) {
        var id = _a[_i];
        (0, psdWriter_1.writeUint8)(writer, id);
    }
});
addHandler(1069, function (target) { return target.layerSelectionIds !== undefined; }, function (reader, target) {
    var count = (0, psdReader_1.readUint16)(reader);
    target.layerSelectionIds = [];
    while (count--) {
        target.layerSelectionIds.push((0, psdReader_1.readUint32)(reader));
    }
}, function (writer, target) {
    (0, psdWriter_1.writeUint16)(writer, target.layerSelectionIds.length);
    for (var _i = 0, _a = target.layerSelectionIds; _i < _a.length; _i++) {
        var id = _a[_i];
        (0, psdWriter_1.writeUint32)(writer, id);
    }
});
addHandler(1032, function (target) { return target.gridAndGuidesInformation !== undefined; }, function (reader, target) {
    var version = (0, psdReader_1.readUint32)(reader);
    var horizontal = (0, psdReader_1.readUint32)(reader);
    var vertical = (0, psdReader_1.readUint32)(reader);
    var count = (0, psdReader_1.readUint32)(reader);
    if (version !== 1)
        throw new Error("Invalid 1032 resource version: ".concat(version));
    target.gridAndGuidesInformation = {
        grid: { horizontal: horizontal, vertical: vertical },
        guides: [],
    };
    for (var i = 0; i < count; i++) {
        target.gridAndGuidesInformation.guides.push({
            location: (0, psdReader_1.readUint32)(reader) / 32,
            direction: (0, psdReader_1.readUint8)(reader) ? 'horizontal' : 'vertical'
        });
    }
}, function (writer, target) {
    var info = target.gridAndGuidesInformation;
    var grid = info.grid || { horizontal: 18 * 32, vertical: 18 * 32 };
    var guides = info.guides || [];
    (0, psdWriter_1.writeUint32)(writer, 1);
    (0, psdWriter_1.writeUint32)(writer, grid.horizontal);
    (0, psdWriter_1.writeUint32)(writer, grid.vertical);
    (0, psdWriter_1.writeUint32)(writer, guides.length);
    for (var _i = 0, guides_1 = guides; _i < guides_1.length; _i++) {
        var g = guides_1[_i];
        (0, psdWriter_1.writeUint32)(writer, g.location * 32);
        (0, psdWriter_1.writeUint8)(writer, g.direction === 'horizontal' ? 1 : 0);
    }
});
addHandler(1065, // Layer Comps
function (// Layer Comps
target) { return target.layerComps !== undefined; }, function (reader, target) {
    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader, true);
    // console.log('CompList', require('util').inspect(desc, false, 99, true));
    target.layerComps = { list: [] };
    for (var _i = 0, _a = desc.list; _i < _a.length; _i++) {
        var item = _a[_i];
        target.layerComps.list.push({
            id: item.compID,
            name: item['Nm  '],
            capturedInfo: item.capturedInfo,
        });
        if ('comment' in item)
            target.layerComps.list[target.layerComps.list.length - 1].comment = item.comment;
    }
    if ('lastAppliedComp' in desc)
        target.layerComps.lastApplied = desc.lastAppliedComp;
}, function (writer, target) {
    var layerComps = target.layerComps;
    var desc = { list: [] };
    for (var _i = 0, _a = layerComps.list; _i < _a.length; _i++) {
        var item = _a[_i];
        var t = {};
        t._classID = 'Comp';
        t['Nm  '] = item.name;
        if ('comment' in item)
            t.comment = item.comment;
        t.compID = item.id;
        t.capturedInfo = item.capturedInfo;
        desc.list.push(t);
    }
    if ('lastApplied' in layerComps)
        desc.lastAppliedComp = layerComps.lastApplied;
    // console.log('CompList', require('util').inspect(desc, false, 99, true));
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'CompList', desc);
});
helpers_1.MOCK_HANDLERS && addHandler(1092, // ???
function (// ???
target) { return target._ir1092 !== undefined; }, function (reader, target, left) {
    LOG_MOCK_HANDLERS && console.log('image resource 1092', left());
    // 16 bytes, seems to be 4 integers
    target._ir1092 = (0, psdReader_1.readBytes)(reader, left());
}, function (writer, target) {
    (0, psdWriter_1.writeBytes)(writer, target._ir1092);
});
// 0 - normal, 7 - multiply, 8 - screen, 23 - difference
var onionSkinsBlendModes = [
    'normal', undefined, undefined, undefined, undefined, undefined, undefined, 'multiply',
    'screen', undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'difference',
];
addHandler(1078, // Onion Skins
function (// Onion Skins
target) { return target.onionSkins !== undefined; }, function (reader, target) {
    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
    // console.log('1078', require('util').inspect(desc, false, 99, true));
    target.onionSkins = {
        enabled: desc.enab,
        framesBefore: desc.numBefore,
        framesAfter: desc.numAfter,
        frameSpacing: desc.Spcn,
        minOpacity: desc.minOpacity / 100,
        maxOpacity: desc.maxOpacity / 100,
        blendMode: onionSkinsBlendModes[desc.BlnM] || 'normal',
    };
}, function (writer, target) {
    var onionSkins = target.onionSkins;
    var desc = {
        Vrsn: 1,
        enab: onionSkins.enabled,
        numBefore: onionSkins.framesBefore,
        numAfter: onionSkins.framesAfter,
        Spcn: onionSkins.frameSpacing,
        minOpacity: (onionSkins.minOpacity * 100) | 0,
        maxOpacity: (onionSkins.maxOpacity * 100) | 0,
        BlnM: Math.max(0, onionSkinsBlendModes.indexOf(onionSkins.blendMode)),
    };
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc);
});
addHandler(1075, // Timeline Information
function (// Timeline Information
target) { return target.timelineInformation !== undefined; }, function (reader, target, _, options) {
    var _a, _b;
    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
    target.timelineInformation = {
        enabled: desc.enab,
        frameStep: (0, descriptor_1.frac)(desc.frameStep),
        frameRate: desc.frameRate,
        time: (0, descriptor_1.frac)(desc.time),
        duration: (0, descriptor_1.frac)(desc.duration),
        workInTime: (0, descriptor_1.frac)(desc.workInTime),
        workOutTime: (0, descriptor_1.frac)(desc.workOutTime),
        repeats: desc.LCnt,
        hasMotion: desc.hasMotion,
        globalTracks: (0, descriptor_1.parseTrackList)(desc.globalTrackList, !!options.logMissingFeatures),
    };
    if ((_b = (_a = desc.audioClipGroupList) === null || _a === void 0 ? void 0 : _a.audioClipGroupList) === null || _b === void 0 ? void 0 : _b.length) {
        target.timelineInformation.audioClipGroups = desc.audioClipGroupList.audioClipGroupList.map(function (g) { return ({
            id: g.groupID,
            muted: g.muted,
            audioClips: g.audioClipList.map(function (_a) {
                var clipID = _a.clipID, timeScope = _a.timeScope, muted = _a.muted, audioLevel = _a.audioLevel, frameReader = _a.frameReader;
                return ({
                    id: clipID,
                    start: (0, descriptor_1.frac)(timeScope.Strt),
                    duration: (0, descriptor_1.frac)(timeScope.duration),
                    inTime: (0, descriptor_1.frac)(timeScope.inTime),
                    outTime: (0, descriptor_1.frac)(timeScope.outTime),
                    muted: muted,
                    audioLevel: audioLevel,
                    frameReader: {
                        type: frameReader.frameReaderType,
                        mediaDescriptor: frameReader.mediaDescriptor,
                        link: {
                            name: frameReader['Lnk ']['Nm  '],
                            fullPath: frameReader['Lnk '].fullPath,
                            relativePath: frameReader['Lnk '].relPath,
                        },
                    },
                });
            }),
        }); });
    }
}, function (writer, target) {
    var _a;
    var timeline = target.timelineInformation;
    var desc = {
        Vrsn: 1,
        enab: timeline.enabled,
        frameStep: timeline.frameStep,
        frameRate: timeline.frameRate,
        time: timeline.time,
        duration: timeline.duration,
        workInTime: timeline.workInTime,
        workOutTime: timeline.workOutTime,
        LCnt: timeline.repeats,
        globalTrackList: (0, descriptor_1.serializeTrackList)(timeline.globalTracks),
        audioClipGroupList: {
            audioClipGroupList: (_a = timeline.audioClipGroups) === null || _a === void 0 ? void 0 : _a.map(function (a) { return ({
                groupID: a.id,
                muted: a.muted,
                audioClipList: a.audioClips.map(function (c) { return ({
                    clipID: c.id,
                    timeScope: {
                        Vrsn: 1,
                        Strt: c.start,
                        duration: c.duration,
                        inTime: c.inTime,
                        outTime: c.outTime,
                    },
                    frameReader: {
                        frameReaderType: c.frameReader.type,
                        descVersion: 1,
                        'Lnk ': {
                            descVersion: 1,
                            'Nm  ': c.frameReader.link.name,
                            fullPath: c.frameReader.link.fullPath,
                            relPath: c.frameReader.link.relativePath,
                        },
                        mediaDescriptor: c.frameReader.mediaDescriptor,
                    },
                    muted: c.muted,
                    audioLevel: c.audioLevel,
                }); }),
            }); }),
        },
        hasMotion: timeline.hasMotion,
    };
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc, 'anim');
});
addHandler(1076, // Sheet Disclosure
function (// Sheet Disclosure
target) { return target.sheetDisclosure !== undefined; }, function (reader, target) {
    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
    target.sheetDisclosure = {};
    if (desc.sheetTimelineOptions) {
        target.sheetDisclosure.sheetTimelineOptions = desc.sheetTimelineOptions.map(function (o) { return ({
            sheetID: o.sheetID,
            sheetDisclosed: o.sheetDisclosed,
            lightsDisclosed: o.lightsDisclosed,
            meshesDisclosed: o.meshesDisclosed,
            materialsDisclosed: o.materialsDisclosed,
        }); });
    }
}, function (writer, target) {
    var disclosure = target.sheetDisclosure;
    var desc = { Vrsn: 1 };
    if (disclosure.sheetTimelineOptions) {
        desc.sheetTimelineOptions = disclosure.sheetTimelineOptions.map(function (d) { return ({
            Vrsn: 2,
            sheetID: d.sheetID,
            sheetDisclosed: d.sheetDisclosed,
            lightsDisclosed: d.lightsDisclosed,
            meshesDisclosed: d.meshesDisclosed,
            materialsDisclosed: d.materialsDisclosed,
        }); });
    }
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc);
});
addHandler(1054, // URL List
function (// URL List
target) { return target.urlsList !== undefined; }, function (reader, target, _, options) {
    var count = (0, psdReader_1.readUint32)(reader);
    target.urlsList = [];
    for (var i = 0; i < count; i++) {
        var long = (0, psdReader_1.readSignature)(reader);
        if (long !== 'slic' && options.throwForMissingFeatures)
            throw new Error('Unknown long');
        var id = (0, psdReader_1.readUint32)(reader);
        var url = (0, psdReader_1.readUnicodeString)(reader);
        target.urlsList.push({ id: id, url: url, ref: 'slice' });
    }
}, function (writer, target) {
    var list = target.urlsList;
    (0, psdWriter_1.writeUint32)(writer, list.length);
    for (var i = 0; i < list.length; i++) {
        (0, psdWriter_1.writeSignature)(writer, 'slic');
        (0, psdWriter_1.writeUint32)(writer, list[i].id);
        (0, psdWriter_1.writeUnicodeString)(writer, list[i].url);
    }
});
function boundsToBounds(bounds) {
    return { 'Top ': bounds.top, Left: bounds.left, Btom: bounds.bottom, Rght: bounds.right };
}
function boundsFromBounds(bounds) {
    return { top: bounds['Top '], left: bounds.Left, bottom: bounds.Btom, right: bounds.Rght };
}
function clamped(array, index) {
    return array[Math.max(0, Math.min(array.length - 1, index))];
}
var sliceOrigins = ['autoGenerated', 'layer', 'userGenerated'];
var sliceTypes = ['noImage', 'image'];
var sliceAlignments = ['default'];
addHandler(1050, // Slices
function (// Slices
target) { return target.slices ? target.slices.length : 0; }, function (reader, target) {
    var version = (0, psdReader_1.readUint32)(reader);
    if (version == 6) {
        if (!target.slices)
            target.slices = [];
        var top_1 = (0, psdReader_1.readInt32)(reader);
        var left = (0, psdReader_1.readInt32)(reader);
        var bottom = (0, psdReader_1.readInt32)(reader);
        var right = (0, psdReader_1.readInt32)(reader);
        var groupName = (0, psdReader_1.readUnicodeString)(reader);
        var count = (0, psdReader_1.readUint32)(reader);
        target.slices.push({ bounds: { top: top_1, left: left, bottom: bottom, right: right }, groupName: groupName, slices: [] });
        var slices_1 = target.slices[target.slices.length - 1].slices;
        for (var i = 0; i < count; i++) {
            var id = (0, psdReader_1.readUint32)(reader);
            var groupId = (0, psdReader_1.readUint32)(reader);
            var origin_1 = clamped(sliceOrigins, (0, psdReader_1.readUint32)(reader));
            var associatedLayerId = origin_1 == 'layer' ? (0, psdReader_1.readUint32)(reader) : 0;
            var name_3 = (0, psdReader_1.readUnicodeString)(reader);
            var type = clamped(sliceTypes, (0, psdReader_1.readUint32)(reader));
            var left_1 = (0, psdReader_1.readInt32)(reader);
            var top_2 = (0, psdReader_1.readInt32)(reader);
            var right_1 = (0, psdReader_1.readInt32)(reader);
            var bottom_1 = (0, psdReader_1.readInt32)(reader);
            var url = (0, psdReader_1.readUnicodeString)(reader);
            var target_1 = (0, psdReader_1.readUnicodeString)(reader);
            var message = (0, psdReader_1.readUnicodeString)(reader);
            var altTag = (0, psdReader_1.readUnicodeString)(reader);
            var cellTextIsHTML = !!(0, psdReader_1.readUint8)(reader);
            var cellText = (0, psdReader_1.readUnicodeString)(reader);
            var horizontalAlignment = clamped(sliceAlignments, (0, psdReader_1.readUint32)(reader));
            var verticalAlignment = clamped(sliceAlignments, (0, psdReader_1.readUint32)(reader));
            var a = (0, psdReader_1.readUint8)(reader);
            var r = (0, psdReader_1.readUint8)(reader);
            var g = (0, psdReader_1.readUint8)(reader);
            var b = (0, psdReader_1.readUint8)(reader);
            var backgroundColorType = ((a + r + g + b) === 0) ? 'none' : (a === 0 ? 'matte' : 'color');
            slices_1.push({
                id: id,
                groupId: groupId,
                origin: origin_1,
                associatedLayerId: associatedLayerId,
                name: name_3,
                target: target_1,
                message: message,
                altTag: altTag,
                cellTextIsHTML: cellTextIsHTML,
                cellText: cellText,
                horizontalAlignment: horizontalAlignment,
                verticalAlignment: verticalAlignment,
                type: type,
                url: url,
                bounds: { top: top_2, left: left_1, bottom: bottom_1, right: right_1 },
                backgroundColorType: backgroundColorType,
                backgroundColor: { r: r, g: g, b: b, a: a },
            });
        }
        var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
        desc.slices.forEach(function (d) {
            var slice = slices_1.find(function (s) { return d.sliceID == s.id; });
            if (slice) {
                slice.topOutset = d.topOutset;
                slice.leftOutset = d.leftOutset;
                slice.bottomOutset = d.bottomOutset;
                slice.rightOutset = d.rightOutset;
            }
        });
    }
    else if (version == 7 || version == 8) {
        var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
        if (!target.slices)
            target.slices = [];
        target.slices.push({
            groupName: desc.baseName,
            bounds: boundsFromBounds(desc.bounds),
            slices: desc.slices.map(function (s) { return ({
                name: '',
                id: s.sliceID,
                groupId: s.groupID,
                associatedLayerId: 0,
                origin: descriptor_1.ESliceOrigin.decode(s.origin),
                type: descriptor_1.ESliceType.decode(s.Type),
                bounds: boundsFromBounds(s.bounds),
                url: s.url,
                target: s.null,
                message: s.Msge,
                altTag: s.altTag,
                cellTextIsHTML: s.cellTextIsHTML,
                cellText: s.cellText,
                horizontalAlignment: descriptor_1.ESliceHorzAlign.decode(s.horzAlign),
                verticalAlignment: descriptor_1.ESliceVertAlign.decode(s.vertAlign),
                backgroundColorType: descriptor_1.ESliceBGColorType.decode(s.bgColorType),
                backgroundColor: s.bgColor ? { r: s.bgColor['Rd  '], g: s.bgColor['Grn '], b: s.bgColor['Bl  '], a: s.bgColor.alpha } : { r: 0, g: 0, b: 0, a: 0 },
                topOutset: s.topOutset || 0,
                leftOutset: s.leftOutset || 0,
                bottomOutset: s.bottomOutset || 0,
                rightOutset: s.rightOutset || 0,
            }); }),
        });
    }
    else {
        throw new Error("Invalid slices version (".concat(version, ")"));
    }
}, function (writer, target, index) {
    var _a = target.slices[index], bounds = _a.bounds, groupName = _a.groupName, slices = _a.slices;
    (0, psdWriter_1.writeUint32)(writer, 6); // version
    (0, psdWriter_1.writeInt32)(writer, bounds.top);
    (0, psdWriter_1.writeInt32)(writer, bounds.left);
    (0, psdWriter_1.writeInt32)(writer, bounds.bottom);
    (0, psdWriter_1.writeInt32)(writer, bounds.right);
    (0, psdWriter_1.writeUnicodeString)(writer, groupName);
    (0, psdWriter_1.writeUint32)(writer, slices.length);
    for (var i = 0; i < slices.length; i++) {
        var slice = slices[i];
        var _b = slice.backgroundColor, a = _b.a, r = _b.r, g = _b.g, b = _b.b;
        if (slice.backgroundColorType === 'none') {
            a = r = g = b = 0;
        }
        else if (slice.backgroundColorType === 'matte') {
            a = 0;
            r = g = b = 255;
        }
        (0, psdWriter_1.writeUint32)(writer, slice.id);
        (0, psdWriter_1.writeUint32)(writer, slice.groupId);
        (0, psdWriter_1.writeUint32)(writer, sliceOrigins.indexOf(slice.origin));
        if (slice.origin === 'layer')
            (0, psdWriter_1.writeUint32)(writer, slice.associatedLayerId);
        (0, psdWriter_1.writeUnicodeString)(writer, slice.name);
        (0, psdWriter_1.writeUint32)(writer, sliceTypes.indexOf(slice.type));
        (0, psdWriter_1.writeInt32)(writer, slice.bounds.left);
        (0, psdWriter_1.writeInt32)(writer, slice.bounds.top);
        (0, psdWriter_1.writeInt32)(writer, slice.bounds.right);
        (0, psdWriter_1.writeInt32)(writer, slice.bounds.bottom);
        (0, psdWriter_1.writeUnicodeString)(writer, slice.url);
        (0, psdWriter_1.writeUnicodeString)(writer, slice.target);
        (0, psdWriter_1.writeUnicodeString)(writer, slice.message);
        (0, psdWriter_1.writeUnicodeString)(writer, slice.altTag);
        (0, psdWriter_1.writeUint8)(writer, slice.cellTextIsHTML ? 1 : 0);
        (0, psdWriter_1.writeUnicodeString)(writer, slice.cellText);
        (0, psdWriter_1.writeUint32)(writer, sliceAlignments.indexOf(slice.horizontalAlignment));
        (0, psdWriter_1.writeUint32)(writer, sliceAlignments.indexOf(slice.verticalAlignment));
        (0, psdWriter_1.writeUint8)(writer, a);
        (0, psdWriter_1.writeUint8)(writer, r);
        (0, psdWriter_1.writeUint8)(writer, g);
        (0, psdWriter_1.writeUint8)(writer, b);
    }
    var desc = {
        bounds: boundsToBounds(bounds),
        slices: [],
    };
    slices.forEach(function (s) {
        var slice = __assign(__assign({ sliceID: s.id, groupID: s.groupId, origin: descriptor_1.ESliceOrigin.encode(s.origin), Type: descriptor_1.ESliceType.encode(s.type), bounds: boundsToBounds(s.bounds) }, (s.name ? { 'Nm  ': s.name } : {})), { url: s.url, null: s.target, Msge: s.message, altTag: s.altTag, cellTextIsHTML: s.cellTextIsHTML, cellText: s.cellText, horzAlign: descriptor_1.ESliceHorzAlign.encode(s.horizontalAlignment), vertAlign: descriptor_1.ESliceVertAlign.encode(s.verticalAlignment), bgColorType: descriptor_1.ESliceBGColorType.encode(s.backgroundColorType) });
        if (s.backgroundColorType === 'color') {
            var _a = s.backgroundColor, r = _a.r, g = _a.g, b = _a.b, a = _a.a;
            slice.bgColor = { 'Rd  ': r, 'Grn ': g, 'Bl  ': b, alpha: a };
        }
        slice.topOutset = s.topOutset || 0;
        slice.leftOutset = s.leftOutset || 0;
        slice.bottomOutset = s.bottomOutset || 0;
        slice.rightOutset = s.rightOutset || 0;
        desc.slices.push(slice);
    });
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc, 'slices');
});
addHandler(1064, function (target) { return target.pixelAspectRatio !== undefined; }, function (reader, target) {
    if ((0, psdReader_1.readUint32)(reader) > 2)
        throw new Error('Invalid pixelAspectRatio version');
    target.pixelAspectRatio = { aspect: (0, psdReader_1.readFloat64)(reader) };
}, function (writer, target) {
    (0, psdWriter_1.writeUint32)(writer, 2); // version
    (0, psdWriter_1.writeFloat64)(writer, target.pixelAspectRatio.aspect);
});
addHandler(1041, function (target) { return target.iccUntaggedProfile !== undefined; }, function (reader, target) {
    target.iccUntaggedProfile = !!(0, psdReader_1.readUint8)(reader);
}, function (writer, target) {
    (0, psdWriter_1.writeUint8)(writer, target.iccUntaggedProfile ? 1 : 0);
});
helpers_1.MOCK_HANDLERS && addHandler(1039, // ICC Profile
function (// ICC Profile
target) { return target._ir1039 !== undefined; }, function (reader, target, left) {
    // TODO: this is raw bytes, just return as a byte array
    LOG_MOCK_HANDLERS && console.log('image resource 1039', left());
    target._ir1039 = (0, psdReader_1.readBytes)(reader, left());
}, function (writer, target) {
    (0, psdWriter_1.writeBytes)(writer, target._ir1039);
});
addHandler(1044, function (target) { return target.idsSeedNumber !== undefined; }, function (reader, target) { return target.idsSeedNumber = (0, psdReader_1.readUint32)(reader); }, function (writer, target) { return (0, psdWriter_1.writeUint32)(writer, target.idsSeedNumber); });
addHandler(1036, function (target) { return target.thumbnail !== undefined || target.thumbnailRaw !== undefined; }, function (reader, target, left, options) {
    var format = (0, psdReader_1.readUint32)(reader); // 1 = kJpegRGB, 0 = kRawRGB
    var width = (0, psdReader_1.readUint32)(reader);
    var height = (0, psdReader_1.readUint32)(reader);
    (0, psdReader_1.readUint32)(reader); // widthBytes = (width * bits_per_pixel + 31) / 32 * 4.
    (0, psdReader_1.readUint32)(reader); // totalSize = widthBytes * height * planes
    (0, psdReader_1.readUint32)(reader); // sizeAfterCompression
    var bitsPerPixel = (0, psdReader_1.readUint16)(reader); // 24
    var planes = (0, psdReader_1.readUint16)(reader); // 1
    if (format !== 1 || bitsPerPixel !== 24 || planes !== 1) {
        options.logMissingFeatures && console.log("Invalid thumbnail data (format: ".concat(format, ", bitsPerPixel: ").concat(bitsPerPixel, ", planes: ").concat(planes, ")"));
        (0, psdReader_1.skipBytes)(reader, left());
        return;
    }
    var size = left();
    var data = (0, psdReader_1.readBytes)(reader, size);
    if (options.useRawThumbnail) {
        target.thumbnailRaw = { width: width, height: height, data: data };
    }
    else if (data.byteLength) {
        target.thumbnail = (0, helpers_1.createCanvasFromData)(data);
    }
}, function (writer, target) {
    var _a;
    var width = 0;
    var height = 0;
    var data;
    if (target.thumbnailRaw) {
        width = target.thumbnailRaw.width;
        height = target.thumbnailRaw.height;
        data = target.thumbnailRaw.data;
    }
    else {
        var dataUrl = (_a = target.thumbnail.toDataURL('image/jpeg', 1)) === null || _a === void 0 ? void 0 : _a.substring('data:image/jpeg;base64,'.length);
        if (dataUrl) {
            width = target.thumbnail.width;
            height = target.thumbnail.height;
            data = (0, base64_js_1.toByteArray)(dataUrl);
        }
        else {
            data = new Uint8Array(0);
        }
    }
    var bitsPerPixel = 24;
    var widthBytes = Math.floor((width * bitsPerPixel + 31) / 32) * 4;
    var planes = 1;
    var totalSize = widthBytes * height * planes;
    var sizeAfterCompression = data.length;
    (0, psdWriter_1.writeUint32)(writer, 1); // 1 = kJpegRGB
    (0, psdWriter_1.writeUint32)(writer, width);
    (0, psdWriter_1.writeUint32)(writer, height);
    (0, psdWriter_1.writeUint32)(writer, widthBytes);
    (0, psdWriter_1.writeUint32)(writer, totalSize);
    (0, psdWriter_1.writeUint32)(writer, sizeAfterCompression);
    (0, psdWriter_1.writeUint16)(writer, bitsPerPixel);
    (0, psdWriter_1.writeUint16)(writer, planes);
    (0, psdWriter_1.writeBytes)(writer, data);
});
addHandler(1057, function (target) { return target.versionInfo !== undefined; }, function (reader, target, left) {
    var version = (0, psdReader_1.readUint32)(reader);
    if (version !== 1)
        throw new Error('Invalid versionInfo version');
    target.versionInfo = {
        hasRealMergedData: !!(0, psdReader_1.readUint8)(reader),
        writerName: (0, psdReader_1.readUnicodeString)(reader),
        readerName: (0, psdReader_1.readUnicodeString)(reader),
        fileVersion: (0, psdReader_1.readUint32)(reader),
    };
    (0, psdReader_1.skipBytes)(reader, left());
}, function (writer, target) {
    var versionInfo = target.versionInfo;
    (0, psdWriter_1.writeUint32)(writer, 1); // version
    (0, psdWriter_1.writeUint8)(writer, versionInfo.hasRealMergedData ? 1 : 0);
    (0, psdWriter_1.writeUnicodeString)(writer, versionInfo.writerName);
    (0, psdWriter_1.writeUnicodeString)(writer, versionInfo.readerName);
    (0, psdWriter_1.writeUint32)(writer, versionInfo.fileVersion);
});
helpers_1.MOCK_HANDLERS && addHandler(1058, // EXIF data 1.
function (// EXIF data 1.
target) { return target._ir1058 !== undefined; }, function (reader, target, left) {
    LOG_MOCK_HANDLERS && console.log('image resource 1058', left());
    target._ir1058 = (0, psdReader_1.readBytes)(reader, left());
}, function (writer, target) {
    (0, psdWriter_1.writeBytes)(writer, target._ir1058);
});
addHandler(7000, function (target) { return target.imageReadyVariables !== undefined; }, function (reader, target, left) {
    target.imageReadyVariables = readUtf8String(reader, left());
}, function (writer, target) {
    writeUtf8String(writer, target.imageReadyVariables);
});
addHandler(7001, function (target) { return target.imageReadyDataSets !== undefined; }, function (reader, target, left) {
    target.imageReadyDataSets = readUtf8String(reader, left());
}, function (writer, target) {
    writeUtf8String(writer, target.imageReadyDataSets);
});
addHandler(1088, function (target) { return target.pathSelectionState !== undefined; }, function (reader, target, _left) {
    var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
    target.pathSelectionState = desc['null'];
}, function (writer, target) {
    var desc = { 'null': target.pathSelectionState };
    (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc);
});
helpers_1.MOCK_HANDLERS && addHandler(1025, function (target) { return target._ir1025 !== undefined; }, function (reader, target, left) {
    LOG_MOCK_HANDLERS && console.log('image resource 1025', left());
    target._ir1025 = (0, psdReader_1.readBytes)(reader, left());
}, function (writer, target) {
    (0, psdWriter_1.writeBytes)(writer, target._ir1025);
});
var FrmD = (0, helpers_1.createEnum)('FrmD', '', {
    auto: 'Auto',
    none: 'None',
    dispose: 'Disp',
});
addHandler(4000, // Plug-In resource(s)
function (// Plug-In resource(s)
target) { return target.animations !== undefined; }, function (reader, target, left, _a) {
    var logMissingFeatures = _a.logMissingFeatures, logDevFeatures = _a.logDevFeatures;
    var key = (0, psdReader_1.readSignature)(reader);
    if (key === 'mani') {
        (0, psdReader_1.checkSignature)(reader, 'IRFR');
        (0, psdReader_1.readSection)(reader, 1, function (left) {
            var _loop_1 = function () {
                (0, psdReader_1.checkSignature)(reader, '8BIM');
                var key_1 = (0, psdReader_1.readSignature)(reader);
                (0, psdReader_1.readSection)(reader, 1, function (left) {
                    if (key_1 === 'AnDs') {
                        var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
                        target.animations = {
                            // desc.AFSt ???
                            frames: desc.FrIn.map(function (x) { return ({
                                id: x.FrID,
                                delay: (x.FrDl || 0) / 100,
                                dispose: x.FrDs ? FrmD.decode(x.FrDs) : 'auto', // missing == auto
                                // x.FrGA ???
                            }); }),
                            animations: desc.FSts.map(function (x) { return ({
                                id: x.FsID,
                                frames: x.FsFr,
                                repeats: x.LCnt,
                                activeFrame: x.AFrm || 0,
                            }); }),
                        };
                        // console.log('#4000 AnDs', require('util').inspect(desc, false, 99, true));
                        // console.log('#4000 AnDs:result', require('util').inspect(target.animations, false, 99, true));
                    }
                    else if (key_1 === 'Roll') {
                        var bytes = (0, psdReader_1.readBytes)(reader, left());
                        logDevFeatures && console.log('#4000 Roll', bytes);
                    }
                    else {
                        logMissingFeatures && console.log('Unhandled subsection in #4000', key_1);
                    }
                });
            };
            while (left()) {
                _loop_1();
            }
        });
    }
    else if (key === 'mopt') {
        var bytes = (0, psdReader_1.readBytes)(reader, left());
        logDevFeatures && console.log('#4000 mopt', bytes);
    }
    else {
        logMissingFeatures && console.log('Unhandled key in #4000:', key);
    }
}, function (writer, target) {
    if (target.animations) {
        (0, psdWriter_1.writeSignature)(writer, 'mani');
        (0, psdWriter_1.writeSignature)(writer, 'IRFR');
        (0, psdWriter_1.writeSection)(writer, 1, function () {
            (0, psdWriter_1.writeSignature)(writer, '8BIM');
            (0, psdWriter_1.writeSignature)(writer, 'AnDs');
            (0, psdWriter_1.writeSection)(writer, 1, function () {
                var desc = {
                    // AFSt: 0, // ???
                    FrIn: [],
                    FSts: [],
                };
                for (var i = 0; i < target.animations.frames.length; i++) {
                    var f = target.animations.frames[i];
                    var frame = {
                        FrID: f.id,
                    };
                    if (f.delay)
                        frame.FrDl = (f.delay * 100) | 0;
                    frame.FrDs = FrmD.encode(f.dispose);
                    // if (i === 0) frame.FrGA = 30; // ???
                    desc.FrIn.push(frame);
                }
                for (var i = 0; i < target.animations.animations.length; i++) {
                    var a = target.animations.animations[i];
                    var anim = {
                        FsID: a.id,
                        AFrm: a.activeFrame | 0,
                        FsFr: a.frames,
                        LCnt: a.repeats | 0,
                    };
                    desc.FSts.push(anim);
                }
                (0, descriptor_1.writeVersionAndDescriptor)(writer, '', 'null', desc);
            });
            // writeSignature(writer, '8BIM');
            // writeSignature(writer, 'Roll');
            // writeSection(writer, 1, () => {
            // 	writeZeros(writer, 8);
            // });
        });
    }
});
// TODO: Unfinished
helpers_1.MOCK_HANDLERS && addHandler(4001, // Plug-In resource(s)
function (// Plug-In resource(s)
target) { return target._ir4001 !== undefined; }, function (reader, target, left, _a) {
    var logMissingFeatures = _a.logMissingFeatures, logDevFeatures = _a.logDevFeatures;
    if (helpers_1.MOCK_HANDLERS) {
        LOG_MOCK_HANDLERS && console.log('image resource 4001', left());
        target._ir4001 = (0, psdReader_1.readBytes)(reader, left());
        return;
    }
    var key = (0, psdReader_1.readSignature)(reader);
    if (key === 'mfri') {
        var version = (0, psdReader_1.readUint32)(reader);
        if (version !== 2)
            throw new Error('Invalid mfri version');
        var length_1 = (0, psdReader_1.readUint32)(reader);
        var bytes = (0, psdReader_1.readBytes)(reader, length_1);
        logDevFeatures && console.log('mfri', bytes);
    }
    else if (key === 'mset') {
        var desc = (0, descriptor_1.readVersionAndDescriptor)(reader);
        logDevFeatures && console.log('mset', desc);
    }
    else {
        logMissingFeatures && console.log('Unhandled key in #4001', key);
    }
}, function (writer, target) {
    (0, psdWriter_1.writeBytes)(writer, target._ir4001);
});
// TODO: Unfinished
helpers_1.MOCK_HANDLERS && addHandler(4002, // Plug-In resource(s)
function (// Plug-In resource(s)
target) { return target._ir4002 !== undefined; }, function (reader, target, left) {
    LOG_MOCK_HANDLERS && console.log('image resource 4002', left());
    target._ir4002 = (0, psdReader_1.readBytes)(reader, left());
}, function (writer, target) {
    (0, psdWriter_1.writeBytes)(writer, target._ir4002);
});

},{"./descriptor":4,"./helpers":7,"./psdReader":11,"./psdWriter":12,"./utf8":14,"base64-js":21}],9:[function(require,module,exports){
(function (Buffer){(function (){
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writePsdBuffer = exports.writePsdUint8Array = exports.writePsd = exports.readPsd = exports.byteArrayToBase64 = exports.initializeCanvas = void 0;
var psdWriter_1 = require("./psdWriter");
var psdReader_1 = require("./psdReader");
__exportStar(require("./abr"), exports);
__exportStar(require("./csh"), exports);
var helpers_1 = require("./helpers");
Object.defineProperty(exports, "initializeCanvas", { enumerable: true, get: function () { return helpers_1.initializeCanvas; } });
__exportStar(require("./psd"), exports);
var base64_js_1 = require("base64-js");
exports.byteArrayToBase64 = base64_js_1.fromByteArray;
function readPsd(buffer, options) {
    var reader = 'buffer' in buffer ?
        (0, psdReader_1.createReader)(buffer.buffer, buffer.byteOffset, buffer.byteLength) :
        (0, psdReader_1.createReader)(buffer);
    return (0, psdReader_1.readPsd)(reader, options);
}
exports.readPsd = readPsd;
function writePsd(psd, options) {
    var writer = (0, psdWriter_1.createWriter)();
    (0, psdWriter_1.writePsd)(writer, psd, options);
    return (0, psdWriter_1.getWriterBuffer)(writer);
}
exports.writePsd = writePsd;
function writePsdUint8Array(psd, options) {
    var writer = (0, psdWriter_1.createWriter)();
    (0, psdWriter_1.writePsd)(writer, psd, options);
    return (0, psdWriter_1.getWriterBufferNoCopy)(writer);
}
exports.writePsdUint8Array = writePsdUint8Array;
function writePsdBuffer(psd, options) {
    if (typeof Buffer === 'undefined') {
        throw new Error('Buffer not supported on this platform');
    }
    return Buffer.from(writePsdUint8Array(psd, options));
}
exports.writePsdBuffer = writePsdBuffer;

}).call(this)}).call(this,require("buffer").Buffer)
},{"./abr":1,"./csh":3,"./helpers":7,"./psd":10,"./psdReader":11,"./psdWriter":12,"base64-js":21,"buffer":36}],10:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LayerCompCapturedInfo = exports.SectionDividerType = exports.ColorMode = void 0;
var ColorMode;
(function (ColorMode) {
    ColorMode[ColorMode["Bitmap"] = 0] = "Bitmap";
    ColorMode[ColorMode["Grayscale"] = 1] = "Grayscale";
    ColorMode[ColorMode["Indexed"] = 2] = "Indexed";
    ColorMode[ColorMode["RGB"] = 3] = "RGB";
    ColorMode[ColorMode["CMYK"] = 4] = "CMYK";
    ColorMode[ColorMode["Multichannel"] = 7] = "Multichannel";
    ColorMode[ColorMode["Duotone"] = 8] = "Duotone";
    ColorMode[ColorMode["Lab"] = 9] = "Lab";
})(ColorMode = exports.ColorMode || (exports.ColorMode = {}));
var SectionDividerType;
(function (SectionDividerType) {
    SectionDividerType[SectionDividerType["Other"] = 0] = "Other";
    SectionDividerType[SectionDividerType["OpenFolder"] = 1] = "OpenFolder";
    SectionDividerType[SectionDividerType["ClosedFolder"] = 2] = "ClosedFolder";
    SectionDividerType[SectionDividerType["BoundingSectionDivider"] = 3] = "BoundingSectionDivider";
})(SectionDividerType = exports.SectionDividerType || (exports.SectionDividerType = {}));
var LayerCompCapturedInfo;
(function (LayerCompCapturedInfo) {
    LayerCompCapturedInfo[LayerCompCapturedInfo["None"] = 0] = "None";
    LayerCompCapturedInfo[LayerCompCapturedInfo["Visibility"] = 1] = "Visibility";
    LayerCompCapturedInfo[LayerCompCapturedInfo["Position"] = 2] = "Position";
    LayerCompCapturedInfo[LayerCompCapturedInfo["Appearance"] = 4] = "Appearance";
})(LayerCompCapturedInfo = exports.LayerCompCapturedInfo || (exports.LayerCompCapturedInfo = {}));

},{}],11:[function(require,module,exports){
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readPattern = exports.readColor = exports.readSection = exports.readDataRLE = exports.readDataZip = exports.readAdditionalLayerInfo = exports.readGlobalLayerMaskInfo = exports.readLayerInfo = exports.readPsd = exports.checkSignature = exports.skipBytes = exports.readAsciiString = exports.readUnicodeStringWithLengthLE = exports.readUnicodeStringWithLength = exports.readUnicodeString = exports.readPascalString = exports.readSignature = exports.readBytes = exports.readFixedPointPath32 = exports.readFixedPoint32 = exports.readFloat64 = exports.readFloat32 = exports.readUint32 = exports.readInt32LE = exports.readInt32 = exports.readUint16LE = exports.readUint16 = exports.readInt16 = exports.peekUint8 = exports.readUint8 = exports.warnOrThrow = exports.createReader = exports.supportedColorModes = void 0;
var zlib_1 = require("zlib");
var helpers_1 = require("./helpers");
var additionalInfo_1 = require("./additionalInfo");
var imageResources_1 = require("./imageResources");
exports.supportedColorModes = [0 /* ColorMode.Bitmap */, 1 /* ColorMode.Grayscale */, 3 /* ColorMode.RGB */];
var colorModes = ['bitmap', 'grayscale', 'indexed', 'RGB', 'CMYK', 'multichannel', 'duotone', 'lab'];
function setupGrayscale(data) {
    var size = data.width * data.height * 4;
    for (var i = 0; i < size; i += 4) {
        data.data[i + 1] = data.data[i];
        data.data[i + 2] = data.data[i];
    }
}
function createReader(buffer, offset, length) {
    var view = new DataView(buffer, offset, length);
    return { view: view, offset: 0, strict: false, debug: false };
}
exports.createReader = createReader;
function warnOrThrow(reader, message) {
    if (reader.strict)
        throw new Error(message);
    if (reader.debug)
        console.warn(message);
}
exports.warnOrThrow = warnOrThrow;
function readUint8(reader) {
    reader.offset += 1;
    return reader.view.getUint8(reader.offset - 1);
}
exports.readUint8 = readUint8;
function peekUint8(reader) {
    return reader.view.getUint8(reader.offset);
}
exports.peekUint8 = peekUint8;
function readInt16(reader) {
    reader.offset += 2;
    return reader.view.getInt16(reader.offset - 2, false);
}
exports.readInt16 = readInt16;
function readUint16(reader) {
    reader.offset += 2;
    return reader.view.getUint16(reader.offset - 2, false);
}
exports.readUint16 = readUint16;
function readUint16LE(reader) {
    reader.offset += 2;
    return reader.view.getUint16(reader.offset - 2, true);
}
exports.readUint16LE = readUint16LE;
function readInt32(reader) {
    reader.offset += 4;
    return reader.view.getInt32(reader.offset - 4, false);
}
exports.readInt32 = readInt32;
function readInt32LE(reader) {
    reader.offset += 4;
    return reader.view.getInt32(reader.offset - 4, true);
}
exports.readInt32LE = readInt32LE;
function readUint32(reader) {
    reader.offset += 4;
    return reader.view.getUint32(reader.offset - 4, false);
}
exports.readUint32 = readUint32;
function readFloat32(reader) {
    reader.offset += 4;
    return reader.view.getFloat32(reader.offset - 4, false);
}
exports.readFloat32 = readFloat32;
function readFloat64(reader) {
    reader.offset += 8;
    return reader.view.getFloat64(reader.offset - 8, false);
}
exports.readFloat64 = readFloat64;
// 32-bit fixed-point number 16.16
function readFixedPoint32(reader) {
    return readInt32(reader) / (1 << 16);
}
exports.readFixedPoint32 = readFixedPoint32;
// 32-bit fixed-point number 8.24
function readFixedPointPath32(reader) {
    return readInt32(reader) / (1 << 24);
}
exports.readFixedPointPath32 = readFixedPointPath32;
function readBytes(reader, length) {
    var start = reader.view.byteOffset + reader.offset;
    reader.offset += length;
    if ((start + length) > reader.view.buffer.byteLength) {
        // fix for broken PSD files that are missing part of file at the end
        warnOrThrow(reader, 'Reading bytes exceeding buffer length');
        if (length > (100 * 1024 * 1024))
            throw new Error('Reading past end of file'); // limit to 100MB
        var result = new Uint8Array(length);
        var len = Math.min(length, reader.view.byteLength - start);
        if (len > 0)
            result.set(new Uint8Array(reader.view.buffer, start, len));
        return result;
    }
    else {
        return new Uint8Array(reader.view.buffer, start, length);
    }
}
exports.readBytes = readBytes;
function readSignature(reader) {
    return readShortString(reader, 4);
}
exports.readSignature = readSignature;
function readPascalString(reader, padTo) {
    var length = readUint8(reader);
    var text = length ? readShortString(reader, length) : '';
    while (++length % padTo) {
        reader.offset++;
    }
    return text;
}
exports.readPascalString = readPascalString;
function readUnicodeString(reader) {
    var length = readUint32(reader);
    return readUnicodeStringWithLength(reader, length);
}
exports.readUnicodeString = readUnicodeString;
function readUnicodeStringWithLength(reader, length) {
    var text = '';
    while (length--) {
        var value = readUint16(reader);
        if (value || length > 0) { // remove trailing \0
            text += String.fromCharCode(value);
        }
    }
    return text;
}
exports.readUnicodeStringWithLength = readUnicodeStringWithLength;
function readUnicodeStringWithLengthLE(reader, length) {
    var text = '';
    while (length--) {
        var value = readUint16LE(reader);
        if (value || length > 0) { // remove trailing \0
            text += String.fromCharCode(value);
        }
    }
    return text;
}
exports.readUnicodeStringWithLengthLE = readUnicodeStringWithLengthLE;
function readAsciiString(reader, length) {
    var text = '';
    while (length--) {
        text += String.fromCharCode(readUint8(reader));
    }
    return text;
}
exports.readAsciiString = readAsciiString;
function skipBytes(reader, count) {
    reader.offset += count;
}
exports.skipBytes = skipBytes;
function checkSignature(reader, a, b) {
    var offset = reader.offset;
    var signature = readSignature(reader);
    if (signature !== a && signature !== b) {
        throw new Error("Invalid signature: '".concat(signature, "' at 0x").concat(offset.toString(16)));
    }
}
exports.checkSignature = checkSignature;
function readShortString(reader, length) {
    var buffer = readBytes(reader, length);
    var result = '';
    for (var i = 0; i < buffer.length; i++) {
        result += String.fromCharCode(buffer[i]);
    }
    return result;
}
function isValidSignature(sig) {
    return sig === '8BIM' || sig === 'MeSa' || sig === 'AgHg' || sig === 'PHUT' || sig === 'DCSR';
}
function readPsd(reader, readOptions) {
    var _a;
    if (readOptions === void 0) { readOptions = {}; }
    // header
    checkSignature(reader, '8BPS');
    var version = readUint16(reader);
    if (version !== 1 && version !== 2)
        throw new Error("Invalid PSD file version: ".concat(version));
    skipBytes(reader, 6);
    var channels = readUint16(reader);
    var height = readUint32(reader);
    var width = readUint32(reader);
    var bitsPerChannel = readUint16(reader);
    var colorMode = readUint16(reader);
    var maxSize = version === 1 ? 30000 : 300000;
    if (width > maxSize || height > maxSize)
        throw new Error("Invalid size: ".concat(width, "x").concat(height));
    if (channels > 16)
        throw new Error("Invalid channel count: ".concat(channels));
    if (![1, 8, 16, 32].includes(bitsPerChannel))
        throw new Error("Invalid bitsPerChannel: ".concat(bitsPerChannel));
    if (exports.supportedColorModes.indexOf(colorMode) === -1)
        throw new Error("Color mode not supported: ".concat((_a = colorModes[colorMode]) !== null && _a !== void 0 ? _a : colorMode));
    var psd = { width: width, height: height, channels: channels, bitsPerChannel: bitsPerChannel, colorMode: colorMode };
    var options = __assign(__assign({}, readOptions), { large: version === 2, globalAlpha: false });
    var fixOffsets = [0, 1, -1, 2, -2, 3, -3, 4, -4];
    // color mode data
    readSection(reader, 1, function (left) {
        if (!left())
            return;
        // const numbers: number[] = [];
        // console.log('color mode', left());
        // while (left()) {
        // 	numbers.push(readUint32(reader));
        // }
        // console.log('color mode', numbers);
        // if (options.throwForMissingFeatures) throw new Error('Color mode data not supported');
        skipBytes(reader, left());
    });
    // image resources
    readSection(reader, 1, function (left) {
        var _loop_1 = function () {
            var sigOffset = reader.offset;
            var sig = '';
            // attempt to fix broken document by realigning with the signature
            for (var _i = 0, fixOffsets_1 = fixOffsets; _i < fixOffsets_1.length; _i++) {
                var offset = fixOffsets_1[_i];
                try {
                    reader.offset = sigOffset + offset;
                    sig = readSignature(reader);
                }
                catch (_a) { }
                if (isValidSignature(sig))
                    break;
            }
            if (!isValidSignature(sig)) {
                throw new Error("Invalid signature: '".concat(sig, "' at 0x").concat((sigOffset).toString(16)));
            }
            var id = readUint16(reader);
            readPascalString(reader, 2); // name
            readSection(reader, 2, function (left) {
                var handler = imageResources_1.resourceHandlersMap[id];
                var skip = id === 1036 && !!options.skipThumbnail;
                if (!psd.imageResources) {
                    psd.imageResources = {};
                }
                if (handler && !skip) {
                    try {
                        handler.read(reader, psd.imageResources, left, options);
                    }
                    catch (e) {
                        if (options.throwForMissingFeatures)
                            throw e;
                        skipBytes(reader, left());
                    }
                }
                else {
                    // options.logMissingFeatures && console.log(`Unhandled image resource: ${id} (${left()})`);
                    skipBytes(reader, left());
                }
            });
        };
        while (left()) {
            _loop_1();
        }
    });
    // layer and mask info
    readSection(reader, 1, function (left) {
        readSection(reader, 2, function (left) {
            readLayerInfo(reader, psd, options);
            skipBytes(reader, left());
        }, undefined, options.large);
        // SAI does not include this section
        if (left() > 0) {
            var globalLayerMaskInfo = readGlobalLayerMaskInfo(reader);
            if (globalLayerMaskInfo)
                psd.globalLayerMaskInfo = globalLayerMaskInfo;
        }
        else {
            // revert back to end of section if exceeded section limits
            // opt.logMissingFeatures && console.log('reverting to end of section');
            skipBytes(reader, left());
        }
        while (left() > 0) {
            // sometimes there are empty bytes here
            while (left() && peekUint8(reader) === 0) {
                // opt.logMissingFeatures && console.log('skipping 0 byte');
                skipBytes(reader, 1);
            }
            if (left() >= 12) {
                readAdditionalLayerInfo(reader, psd, psd, options);
            }
            else {
                // opt.logMissingFeatures && console.log('skipping leftover bytes', left());
                skipBytes(reader, left());
            }
        }
    }, undefined, options.large);
    var hasChildren = psd.children && psd.children.length;
    var skipComposite = options.skipCompositeImageData && (options.skipLayerImageData || hasChildren);
    if (!skipComposite) {
        readImageData(reader, psd, options);
    }
    // TODO: show converted color mode instead of original PSD file color mode
    //       but add option to preserve file color mode (need to return image data instead of canvas in that case)
    // psd.colorMode = ColorMode.RGB; // we convert all color modes to RGB
    return psd;
}
exports.readPsd = readPsd;
function readLayerInfo(reader, psd, options) {
    var layerCount = readInt16(reader);
    if (layerCount < 0) {
        options.globalAlpha = true;
        layerCount = -layerCount;
    }
    var layers = [];
    var layerChannels = [];
    for (var i = 0; i < layerCount; i++) {
        var _a = readLayerRecord(reader, psd, options), layer = _a.layer, channels = _a.channels;
        layers.push(layer);
        layerChannels.push(channels);
    }
    if (!options.skipLayerImageData) {
        for (var i = 0; i < layerCount; i++) {
            readLayerChannelImageData(reader, psd, layers[i], layerChannels[i], options);
        }
    }
    if (!psd.children)
        psd.children = [];
    var stack = [psd];
    for (var i = layers.length - 1; i >= 0; i--) {
        var l = layers[i];
        var type = l.sectionDivider ? l.sectionDivider.type : 0 /* SectionDividerType.Other */;
        if (type === 1 /* SectionDividerType.OpenFolder */ || type === 2 /* SectionDividerType.ClosedFolder */) {
            l.opened = type === 1 /* SectionDividerType.OpenFolder */;
            l.children = [];
            stack[stack.length - 1].children.unshift(l);
            stack.push(l);
        }
        else if (type === 3 /* SectionDividerType.BoundingSectionDivider */) {
            stack.pop();
            // this was workaround because I didn't know what `lsdk` section was, now it's probably not needed anymore
            // } else if (l.name === '</Layer group>' && !l.sectionDivider && !l.top && !l.left && !l.bottom && !l.right) {
            // 	// sometimes layer group terminator doesn't have sectionDivider, so we just guess here (PS bug ?)
            // 	stack.pop();
        }
        else {
            stack[stack.length - 1].children.unshift(l);
        }
    }
}
exports.readLayerInfo = readLayerInfo;
function readLayerRecord(reader, psd, options) {
    var layer = {};
    layer.top = readInt32(reader);
    layer.left = readInt32(reader);
    layer.bottom = readInt32(reader);
    layer.right = readInt32(reader);
    var channelCount = readUint16(reader);
    var channels = [];
    for (var i = 0; i < channelCount; i++) {
        var id = readInt16(reader);
        var length_1 = readUint32(reader);
        if (options.large) {
            if (length_1 !== 0)
                throw new Error('Sizes larger than 4GB are not supported');
            length_1 = readUint32(reader);
        }
        channels.push({ id: id, length: length_1 });
    }
    checkSignature(reader, '8BIM');
    var blendMode = readSignature(reader);
    if (!helpers_1.toBlendMode[blendMode])
        throw new Error("Invalid blend mode: '".concat(blendMode, "'"));
    layer.blendMode = helpers_1.toBlendMode[blendMode];
    layer.opacity = readUint8(reader) / 0xff;
    layer.clipping = readUint8(reader) === 1;
    var flags = readUint8(reader);
    layer.transparencyProtected = (flags & 0x01) !== 0;
    layer.hidden = (flags & 0x02) !== 0;
    if (flags & 0x20)
        layer.effectsOpen = true;
    // 0x04 - obsolete
    // 0x08 - 1 for Photoshop 5.0 and later, tells if bit 4 has useful information
    // 0x10 - pixel data irrelevant to appearance of document
    // 0x20 - effects/filters panel is expanded
    skipBytes(reader, 1);
    readSection(reader, 1, function (left) {
        var mask = readLayerMaskData(reader, options);
        if (mask)
            layer.mask = mask;
        /*const blendingRanges =*/ readLayerBlendingRanges(reader);
        layer.name = readPascalString(reader, 4);
        while (left()) {
            readAdditionalLayerInfo(reader, layer, psd, options);
        }
    });
    return { layer: layer, channels: channels };
}
function readLayerMaskData(reader, options) {
    return readSection(reader, 1, function (left) {
        if (!left())
            return undefined;
        var mask = {};
        mask.top = readInt32(reader);
        mask.left = readInt32(reader);
        mask.bottom = readInt32(reader);
        mask.right = readInt32(reader);
        mask.defaultColor = readUint8(reader);
        var flags = readUint8(reader);
        mask.positionRelativeToLayer = (flags & 1 /* LayerMaskFlags.PositionRelativeToLayer */) !== 0;
        mask.disabled = (flags & 2 /* LayerMaskFlags.LayerMaskDisabled */) !== 0;
        mask.fromVectorData = (flags & 8 /* LayerMaskFlags.LayerMaskFromRenderingOtherData */) !== 0;
        if (flags & 16 /* LayerMaskFlags.MaskHasParametersAppliedToIt */) {
            var params = readUint8(reader);
            if (params & 1 /* MaskParams.UserMaskDensity */)
                mask.userMaskDensity = readUint8(reader) / 0xff;
            if (params & 2 /* MaskParams.UserMaskFeather */)
                mask.userMaskFeather = readFloat64(reader);
            if (params & 4 /* MaskParams.VectorMaskDensity */)
                mask.vectorMaskDensity = readUint8(reader) / 0xff;
            if (params & 8 /* MaskParams.VectorMaskFeather */)
                mask.vectorMaskFeather = readFloat64(reader);
        }
        if (left() > 2) {
            options.logMissingFeatures && console.log('Unhandled extra mask params');
            // TODO: handle these values
            /*const realFlags =*/ readUint8(reader);
            /*const realUserMaskBackground =*/ readUint8(reader);
            /*const top2 =*/ readInt32(reader);
            /*const left2 =*/ readInt32(reader);
            /*const bottom2 =*/ readInt32(reader);
            /*const right2 =*/ readInt32(reader);
        }
        skipBytes(reader, left());
        return mask;
    });
}
function readLayerBlendingRanges(reader) {
    return readSection(reader, 1, function (left) {
        var compositeGrayBlendSource = readUint32(reader);
        var compositeGraphBlendDestinationRange = readUint32(reader);
        var ranges = [];
        while (left()) {
            var sourceRange = readUint32(reader);
            var destRange = readUint32(reader);
            ranges.push({ sourceRange: sourceRange, destRange: destRange });
        }
        return { compositeGrayBlendSource: compositeGrayBlendSource, compositeGraphBlendDestinationRange: compositeGraphBlendDestinationRange, ranges: ranges };
    });
}
function readLayerChannelImageData(reader, psd, layer, channels, options) {
    var _a, _b, _c, _d;
    var layerWidth = (layer.right || 0) - (layer.left || 0);
    var layerHeight = (layer.bottom || 0) - (layer.top || 0);
    var cmyk = psd.colorMode === 4 /* ColorMode.CMYK */;
    var imageData;
    if (layerWidth && layerHeight) {
        if (cmyk) {
            if (psd.bitsPerChannel !== 8)
                throw new Error('bitsPerChannel Not supproted');
            imageData = { width: layerWidth, height: layerHeight, data: new Uint8ClampedArray(layerWidth * layerHeight * 5) };
            for (var p = 4; p < imageData.data.byteLength; p += 5)
                imageData.data[p] = 255;
        }
        else {
            imageData = createImageDataBitDepth(layerWidth, layerHeight, (_a = psd.bitsPerChannel) !== null && _a !== void 0 ? _a : 8);
            (0, helpers_1.resetImageData)(imageData);
        }
    }
    if (helpers_1.RAW_IMAGE_DATA)
        layer.imageDataRaw = [];
    for (var _i = 0, channels_1 = channels; _i < channels_1.length; _i++) {
        var channel = channels_1[_i];
        if (channel.length === 0)
            continue;
        if (channel.length < 2)
            throw new Error('Invalid channel length');
        var start = reader.offset;
        var compression = readUint16(reader);
        // try to fix broken files where there's 1 byte shift of channel
        if (compression > 3) {
            reader.offset -= 1;
            compression = readUint16(reader);
        }
        // try to fix broken files where there's 1 byte shift of channel
        if (compression > 3) {
            reader.offset -= 3;
            compression = readUint16(reader);
        }
        if (compression > 3)
            throw new Error("Invalid compression: ".concat(compression));
        if (channel.id === -2 /* ChannelID.UserMask */) {
            var mask = layer.mask;
            if (!mask)
                throw new Error("Missing layer mask data");
            var maskWidth = (mask.right || 0) - (mask.left || 0);
            var maskHeight = (mask.bottom || 0) - (mask.top || 0);
            if (maskWidth && maskHeight) {
                var maskData = createImageDataBitDepth(maskWidth, maskHeight, (_b = psd.bitsPerChannel) !== null && _b !== void 0 ? _b : 8);
                (0, helpers_1.resetImageData)(maskData);
                var start_1 = reader.offset;
                readData(reader, channel.length, maskData, compression, maskWidth, maskHeight, (_c = psd.bitsPerChannel) !== null && _c !== void 0 ? _c : 8, 0, options.large, 4);
                if (helpers_1.RAW_IMAGE_DATA) {
                    layer.maskDataRaw = new Uint8Array(reader.view.buffer, reader.view.byteOffset + start_1, reader.offset - start_1);
                }
                setupGrayscale(maskData);
                if (options.useImageData) {
                    mask.imageData = maskData;
                }
                else {
                    mask.canvas = (0, helpers_1.imageDataToCanvas)(maskData);
                }
            }
        }
        else {
            var offset = (0, helpers_1.offsetForChannel)(channel.id, cmyk);
            var targetData = imageData;
            if (offset < 0) {
                targetData = undefined;
                if (options.throwForMissingFeatures) {
                    throw new Error("Channel not supported: ".concat(channel.id));
                }
            }
            readData(reader, channel.length, targetData, compression, layerWidth, layerHeight, (_d = psd.bitsPerChannel) !== null && _d !== void 0 ? _d : 8, offset, options.large, cmyk ? 5 : 4);
            if (helpers_1.RAW_IMAGE_DATA) {
                layer.imageDataRaw[channel.id] = new Uint8Array(reader.view.buffer, reader.view.byteOffset + start + 2, channel.length - 2);
            }
            reader.offset = start + channel.length;
            if (targetData && psd.colorMode === 1 /* ColorMode.Grayscale */) {
                setupGrayscale(targetData);
            }
        }
    }
    if (imageData) {
        if (cmyk) {
            var cmykData = imageData;
            imageData = (0, helpers_1.createImageData)(cmykData.width, cmykData.height);
            cmykToRgb(cmykData, imageData, false);
        }
        if (options.useImageData) {
            layer.imageData = imageData;
        }
        else {
            layer.canvas = (0, helpers_1.imageDataToCanvas)(imageData);
        }
    }
}
function readData(reader, length, data, compression, width, height, bitDepth, offset, large, step) {
    if (compression === 0 /* Compression.RawData */) {
        readDataRaw(reader, data, width, height, bitDepth, step, offset);
    }
    else if (compression === 1 /* Compression.RleCompressed */) {
        readDataRLE(reader, data, width, height, bitDepth, step, [offset], large);
    }
    else if (compression === 2 /* Compression.ZipWithoutPrediction */) {
        readDataZip(reader, length, data, width, height, bitDepth, step, offset, false);
    }
    else if (compression === 3 /* Compression.ZipWithPrediction */) {
        readDataZip(reader, length, data, width, height, bitDepth, step, offset, true);
    }
    else {
        throw new Error("Invalid Compression type: ".concat(compression));
    }
}
function readGlobalLayerMaskInfo(reader) {
    return readSection(reader, 1, function (left) {
        if (!left())
            return undefined;
        var overlayColorSpace = readUint16(reader);
        var colorSpace1 = readUint16(reader);
        var colorSpace2 = readUint16(reader);
        var colorSpace3 = readUint16(reader);
        var colorSpace4 = readUint16(reader);
        var opacity = readUint16(reader) / 0xff;
        var kind = readUint8(reader);
        skipBytes(reader, left()); // 3 bytes of padding ?
        return { overlayColorSpace: overlayColorSpace, colorSpace1: colorSpace1, colorSpace2: colorSpace2, colorSpace3: colorSpace3, colorSpace4: colorSpace4, opacity: opacity, kind: kind };
    });
}
exports.readGlobalLayerMaskInfo = readGlobalLayerMaskInfo;
function readAdditionalLayerInfo(reader, target, psd, options) {
    var sig = readSignature(reader);
    if (sig !== '8BIM' && sig !== '8B64')
        throw new Error("Invalid signature: '".concat(sig, "' at 0x").concat((reader.offset - 4).toString(16)));
    var key = readSignature(reader);
    // `largeAdditionalInfoKeys` fallback, because some keys don't have 8B64 signature even when they are 64bit
    var u64 = sig === '8B64' || (options.large && helpers_1.largeAdditionalInfoKeys.indexOf(key) !== -1);
    readSection(reader, 2, function (left) {
        var handler = additionalInfo_1.infoHandlersMap[key];
        if (handler) {
            try {
                handler.read(reader, target, left, psd, options);
            }
            catch (e) {
                if (options.throwForMissingFeatures)
                    throw e;
            }
        }
        else {
            options.logMissingFeatures && console.log("Unhandled additional info: ".concat(key));
            skipBytes(reader, left());
        }
        if (left()) {
            options.logMissingFeatures && console.log("Unread ".concat(left(), " bytes left for additional info: ").concat(key));
            skipBytes(reader, left());
        }
    }, false, u64);
}
exports.readAdditionalLayerInfo = readAdditionalLayerInfo;
function createImageDataBitDepth(width, height, bitDepth) {
    if (bitDepth === 1 || bitDepth === 8) {
        return (0, helpers_1.createImageData)(width, height);
    }
    else if (bitDepth === 16) {
        return { width: width, height: height, data: new Uint16Array(width * height * 4) };
    }
    else if (bitDepth === 32) {
        return { width: width, height: height, data: new Float32Array(width * height * 4) };
    }
    else {
        throw new Error("Invalid bitDepth (".concat(bitDepth, ")"));
    }
}
function readImageData(reader, psd, options) {
    var _a, _b;
    var compression = readUint16(reader);
    var bitsPerChannel = (_a = psd.bitsPerChannel) !== null && _a !== void 0 ? _a : 8;
    if (exports.supportedColorModes.indexOf(psd.colorMode) === -1)
        throw new Error("Color mode not supported: ".concat(psd.colorMode));
    if (compression !== 0 /* Compression.RawData */ && compression !== 1 /* Compression.RleCompressed */)
        throw new Error("Compression type not supported: ".concat(compression));
    var imageData = createImageDataBitDepth(psd.width, psd.height, bitsPerChannel);
    (0, helpers_1.resetImageData)(imageData);
    switch (psd.colorMode) {
        case 0 /* ColorMode.Bitmap */: {
            if (bitsPerChannel !== 1)
                throw new Error('Invalid bitsPerChannel for bitmap color mode');
            var bytes = void 0;
            if (compression === 0 /* Compression.RawData */) {
                bytes = readBytes(reader, Math.ceil(psd.width / 8) * psd.height);
            }
            else if (compression === 1 /* Compression.RleCompressed */) {
                bytes = new Uint8Array(psd.width * psd.height);
                readDataRLE(reader, { data: bytes, width: psd.width, height: psd.height }, psd.width, psd.height, 8, 1, [0], options.large);
            }
            else {
                throw new Error("Bitmap compression not supported: ".concat(compression));
            }
            (0, helpers_1.decodeBitmap)(bytes, imageData.data, psd.width, psd.height);
            break;
        }
        case 3 /* ColorMode.RGB */:
        case 1 /* ColorMode.Grayscale */: {
            var channels = psd.colorMode === 1 /* ColorMode.Grayscale */ ? [0] : [0, 1, 2];
            if (psd.channels && psd.channels > 3) {
                for (var i = 3; i < psd.channels; i++) {
                    // TODO: store these channels in additional image data
                    channels.push(i);
                }
            }
            else if (options.globalAlpha) {
                channels.push(3);
            }
            if (compression === 0 /* Compression.RawData */) {
                for (var i = 0; i < channels.length; i++) {
                    readDataRaw(reader, imageData, psd.width, psd.height, bitsPerChannel, 4, channels[i]);
                }
            }
            else if (compression === 1 /* Compression.RleCompressed */) {
                var start = reader.offset;
                readDataRLE(reader, imageData, psd.width, psd.height, bitsPerChannel, 4, channels, options.large);
                if (helpers_1.RAW_IMAGE_DATA)
                    psd.imageDataRaw = new Uint8Array(reader.view.buffer, reader.view.byteOffset + start, reader.offset - start);
            }
            if (psd.colorMode === 1 /* ColorMode.Grayscale */) {
                setupGrayscale(imageData);
            }
            break;
        }
        case 4 /* ColorMode.CMYK */: {
            if (psd.bitsPerChannel !== 8)
                throw new Error('bitsPerChannel Not supproted');
            if (psd.channels !== 4)
                throw new Error("Invalid channel count");
            var channels = [0, 1, 2, 3];
            if (options.globalAlpha)
                channels.push(4);
            if (compression === 0 /* Compression.RawData */) {
                throw new Error("Not implemented");
                // TODO: ...
                // for (let i = 0; i < channels.length; i++) {
                // 	readDataRaw(reader, imageData, channels[i], psd.width, psd.height);
                // }
            }
            else if (compression === 1 /* Compression.RleCompressed */) {
                var cmykImageData = {
                    width: imageData.width,
                    height: imageData.height,
                    data: new Uint8Array(imageData.width * imageData.height * 5),
                };
                var start = reader.offset;
                readDataRLE(reader, cmykImageData, psd.width, psd.height, (_b = psd.bitsPerChannel) !== null && _b !== void 0 ? _b : 8, 5, channels, options.large);
                cmykToRgb(cmykImageData, imageData, true);
                if (helpers_1.RAW_IMAGE_DATA)
                    psd.imageDataRaw = new Uint8Array(reader.view.buffer, reader.view.byteOffset + start, reader.offset - start);
            }
            break;
        }
        default: throw new Error("Color mode not supported: ".concat(psd.colorMode));
    }
    // remove weird white matte
    if (options.globalAlpha) {
        if (psd.bitsPerChannel !== 8)
            throw new Error('bitsPerChannel Not supproted');
        var p = imageData.data;
        var size = imageData.width * imageData.height * 4;
        for (var i = 0; i < size; i += 4) {
            var pa = p[i + 3];
            if (pa != 0 && pa != 255) {
                var a = pa / 255;
                var ra = 1 / a;
                var invA = 255 * (1 - ra);
                p[i + 0] = p[i + 0] * ra + invA;
                p[i + 1] = p[i + 1] * ra + invA;
                p[i + 2] = p[i + 2] * ra + invA;
            }
        }
    }
    if (options.useImageData) {
        psd.imageData = imageData;
    }
    else {
        psd.canvas = (0, helpers_1.imageDataToCanvas)(imageData);
    }
}
function cmykToRgb(cmyk, rgb, reverseAlpha) {
    var size = rgb.width * rgb.height * 4;
    var srcData = cmyk.data;
    var dstData = rgb.data;
    for (var src = 0, dst = 0; dst < size; src += 5, dst += 4) {
        var c = srcData[src];
        var m = srcData[src + 1];
        var y = srcData[src + 2];
        var k = srcData[src + 3];
        dstData[dst] = ((((c * k) | 0) / 255) | 0);
        dstData[dst + 1] = ((((m * k) | 0) / 255) | 0);
        dstData[dst + 2] = ((((y * k) | 0) / 255) | 0);
        dstData[dst + 3] = reverseAlpha ? 255 - srcData[src + 4] : srcData[src + 4];
    }
    // for (let src = 0, dst = 0; dst < size; src += 5, dst += 4) {
    // 	const c = 1 - (srcData[src + 0] / 255);
    // 	const m = 1 - (srcData[src + 1] / 255);
    // 	const y = 1 - (srcData[src + 2] / 255);
    // 	// const k = srcData[src + 3] / 255;
    // 	dstData[dst + 0] = ((1 - c * 0.8) * 255) | 0;
    // 	dstData[dst + 1] = ((1 - m * 0.8) * 255) | 0;
    // 	dstData[dst + 2] = ((1 - y * 0.8) * 255) | 0;
    // 	dstData[dst + 3] = reverseAlpha ? 255 - srcData[src + 4] : srcData[src + 4];
    // }
}
function verifyCompatible(a, b) {
    if ((a.byteLength / a.length) !== (b.byteLength / b.length)) {
        throw new Error('Invalid array types');
    }
}
function bytesToArray(bytes, bitDepth) {
    if (bitDepth === 8) {
        return bytes;
    }
    else if (bitDepth === 16) {
        if (bytes.byteOffset % 2) {
            var result = new Uint16Array(bytes.byteLength / 2);
            new Uint8Array(result.buffer, result.byteOffset, result.byteLength).set(bytes);
            return result;
        }
        else {
            return new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
        }
    }
    else if (bitDepth === 32) {
        if (bytes.byteOffset % 4) {
            var result = new Float32Array(bytes.byteLength / 4);
            new Uint8Array(result.buffer, result.byteOffset, result.byteLength).set(bytes);
            return result;
        }
        else {
            return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
        }
    }
    else {
        throw new Error("Invalid bitDepth (".concat(bitDepth, ")"));
    }
}
function copyChannelToPixelData(pixelData, channel, offset, step) {
    verifyCompatible(pixelData.data, channel);
    var size = pixelData.width * pixelData.height;
    var data = pixelData.data;
    for (var i = 0, p = offset | 0; i < size; i++, p = (p + step) | 0) {
        data[p] = channel[i];
    }
}
function readDataRaw(reader, pixelData, width, height, bitDepth, step, offset) {
    var buffer = readBytes(reader, width * height * Math.floor(bitDepth / 8));
    if (bitDepth == 32) {
        for (var i = 0; i < buffer.byteLength; i += 4) {
            var a = buffer[i + 0];
            var b = buffer[i + 1];
            var c = buffer[i + 2];
            var d = buffer[i + 3];
            buffer[i + 0] = d;
            buffer[i + 1] = c;
            buffer[i + 2] = b;
            buffer[i + 3] = a;
        }
    }
    var array = bytesToArray(buffer, bitDepth);
    if (pixelData && offset < step) {
        copyChannelToPixelData(pixelData, array, offset, step);
    }
}
function decodePredicted(data, width, height, mod) {
    for (var y = 0; y < height; y++) {
        var offset = y * width;
        for (var x = 1, o = offset + 1; x < width; x++, o++) {
            data[o] = (data[o - 1] + data[o]) % mod;
        }
    }
}
function readDataZip(reader, length, pixelData, width, height, bitDepth, step, offset, prediction) {
    var compressed = readBytes(reader, length);
    var decompressed = (0, zlib_1.inflateSync)(compressed);
    if (pixelData && offset < step) {
        var array = bytesToArray(decompressed, bitDepth);
        if (bitDepth === 8) {
            if (prediction)
                decodePredicted(decompressed, width, height, 0x100);
            copyChannelToPixelData(pixelData, decompressed, offset, step);
        }
        else if (bitDepth === 16) {
            if (prediction)
                decodePredicted(array, width, height, 0x10000);
            copyChannelToPixelData(pixelData, array, offset, step);
        }
        else if (bitDepth === 32) {
            if (prediction)
                decodePredicted(decompressed, width * 4, height, 0x100);
            var di = offset;
            var dst = new Uint32Array(pixelData.data.buffer, pixelData.data.byteOffset, pixelData.data.length);
            for (var y = 0; y < height; y++) {
                var a = width * 4 * y;
                for (var x = 0; x < width; x++, a++, di += step) {
                    var b = a + width;
                    var c = b + width;
                    var d = c + width;
                    dst[di] = ((decompressed[a] << 24) | (decompressed[b] << 16) | (decompressed[c] << 8) | decompressed[d]) >>> 0;
                }
            }
        }
        else {
            throw new Error('Invalid bitDepth');
        }
    }
}
exports.readDataZip = readDataZip;
function readDataRLE(reader, pixelData, _width, height, bitDepth, step, offsets, large) {
    var data = pixelData && pixelData.data;
    var lengths;
    if (large) {
        lengths = new Uint32Array(offsets.length * height);
        for (var o = 0, li = 0; o < offsets.length; o++) {
            for (var y = 0; y < height; y++, li++) {
                lengths[li] = readUint32(reader);
            }
        }
    }
    else {
        lengths = new Uint16Array(offsets.length * height);
        for (var o = 0, li = 0; o < offsets.length; o++) {
            for (var y = 0; y < height; y++, li++) {
                lengths[li] = readUint16(reader);
            }
        }
    }
    if (bitDepth !== 1 && bitDepth !== 8)
        throw new Error("Invalid bit depth (".concat(bitDepth, ")"));
    var extraLimit = (step - 1) | 0; // 3 for rgb, 4 for cmyk
    for (var c = 0, li = 0; c < offsets.length; c++) {
        var offset = offsets[c] | 0;
        var extra = c > extraLimit || offset > extraLimit;
        if (!data || extra) {
            for (var y = 0; y < height; y++, li++) {
                skipBytes(reader, lengths[li]);
            }
        }
        else {
            for (var y = 0, p = offset | 0; y < height; y++, li++) {
                var length_2 = lengths[li];
                var buffer = readBytes(reader, length_2);
                for (var i = 0; i < length_2; i++) {
                    var header = buffer[i];
                    if (header > 128) {
                        var value = buffer[++i];
                        header = (256 - header) | 0;
                        for (var j = 0; j <= header; j = (j + 1) | 0) {
                            data[p] = value;
                            p = (p + step) | 0;
                        }
                    }
                    else if (header < 128) {
                        for (var j = 0; j <= header; j = (j + 1) | 0) {
                            data[p] = buffer[++i];
                            p = (p + step) | 0;
                        }
                    }
                    else {
                        // ignore 128
                    }
                    // This showed up on some images from non-photoshop programs, ignoring it seems to work just fine.
                    // if (i >= length) throw new Error(`Invalid RLE data: exceeded buffer size ${i}/${length}`);
                }
            }
        }
    }
}
exports.readDataRLE = readDataRLE;
function readSection(reader, round, func, skipEmpty, eightBytes) {
    if (skipEmpty === void 0) { skipEmpty = true; }
    if (eightBytes === void 0) { eightBytes = false; }
    var length = readUint32(reader);
    if (eightBytes) {
        if (length !== 0)
            throw new Error('Sizes larger than 4GB are not supported');
        length = readUint32(reader);
    }
    if (length <= 0 && skipEmpty)
        return undefined;
    var end = reader.offset + length;
    if (end > reader.view.byteLength)
        throw new Error('Section exceeds file size');
    var result = func(function () { return end - reader.offset; });
    if (reader.offset !== end) {
        if (reader.offset > end) {
            warnOrThrow(reader, 'Exceeded section limits');
        }
        else {
            warnOrThrow(reader, "Unread section data"); // : ${end - reader.offset} bytes at 0x${reader.offset.toString(16)}`);
        }
    }
    while (end % round)
        end++;
    reader.offset = end;
    return result;
}
exports.readSection = readSection;
function readColor(reader) {
    var colorSpace = readUint16(reader);
    switch (colorSpace) {
        case 0 /* ColorSpace.RGB */: {
            var r = readUint16(reader) / 257;
            var g = readUint16(reader) / 257;
            var b = readUint16(reader) / 257;
            skipBytes(reader, 2);
            return { r: r, g: g, b: b };
        }
        case 1 /* ColorSpace.HSB */: {
            var h = readUint16(reader) / 0xffff;
            var s = readUint16(reader) / 0xffff;
            var b = readUint16(reader) / 0xffff;
            skipBytes(reader, 2);
            return { h: h, s: s, b: b };
        }
        case 2 /* ColorSpace.CMYK */: {
            var c = readUint16(reader) / 257;
            var m = readUint16(reader) / 257;
            var y = readUint16(reader) / 257;
            var k = readUint16(reader) / 257;
            return { c: c, m: m, y: y, k: k };
        }
        case 7 /* ColorSpace.Lab */: {
            var l = readInt16(reader) / 10000;
            var ta = readInt16(reader);
            var tb = readInt16(reader);
            var a = ta < 0 ? (ta / 12800) : (ta / 12700);
            var b = tb < 0 ? (tb / 12800) : (tb / 12700);
            skipBytes(reader, 2);
            return { l: l, a: a, b: b };
        }
        case 8 /* ColorSpace.Grayscale */: {
            var k = readUint16(reader) * 255 / 10000;
            skipBytes(reader, 6);
            return { k: k };
        }
        default:
            throw new Error('Invalid color space');
    }
}
exports.readColor = readColor;
function readPattern(reader) {
    readUint32(reader); // length
    var version = readUint32(reader);
    if (version !== 1)
        throw new Error("Invalid pattern version: ".concat(version));
    var colorMode = readUint32(reader);
    var x = readInt16(reader);
    var y = readInt16(reader);
    // we only support RGB and grayscale for now
    if (colorMode !== 3 /* ColorMode.RGB */ && colorMode !== 1 /* ColorMode.Grayscale */ && colorMode !== 2 /* ColorMode.Indexed */) {
        throw new Error("Unsupported pattern color mode: ".concat(colorMode));
    }
    var name = readUnicodeString(reader);
    var id = readPascalString(reader, 1);
    var palette = [];
    if (colorMode === 2 /* ColorMode.Indexed */) {
        for (var i = 0; i < 256; i++) {
            palette.push({
                r: readUint8(reader),
                g: readUint8(reader),
                b: readUint8(reader),
            });
        }
        skipBytes(reader, 4); // no idea what this is
    }
    // virtual memory array list
    var version2 = readUint32(reader);
    if (version2 !== 3)
        throw new Error("Invalid pattern VMAL version: ".concat(version2));
    readUint32(reader); // length
    var top = readUint32(reader);
    var left = readUint32(reader);
    var bottom = readUint32(reader);
    var right = readUint32(reader);
    var channelsCount = readUint32(reader);
    var width = right - left;
    var height = bottom - top;
    var data = new Uint8Array(width * height * 4);
    for (var i = 3; i < data.byteLength; i += 4) {
        data[i] = 255;
    }
    for (var i = 0, ch = 0; i < (channelsCount + 2); i++) {
        var has = readUint32(reader);
        if (!has)
            continue;
        var length_3 = readUint32(reader);
        var pixelDepth = readUint32(reader);
        var ctop = readUint32(reader);
        var cleft = readUint32(reader);
        var cbottom = readUint32(reader);
        var cright = readUint32(reader);
        var pixelDepth2 = readUint16(reader);
        var compressionMode = readUint8(reader); // 0 - raw, 1 - zip
        var dataLength = length_3 - (4 + 16 + 2 + 1);
        var cdata = readBytes(reader, dataLength);
        if (pixelDepth !== 8 || pixelDepth2 !== 8) {
            throw new Error('16bit pixel depth not supported for patterns');
        }
        var w = cright - cleft;
        var h = cbottom - ctop;
        var ox = cleft - left;
        var oy = ctop - top;
        if (compressionMode === 0) {
            if (colorMode === 3 /* ColorMode.RGB */ && ch < 3) {
                for (var y_1 = 0; y_1 < h; y_1++) {
                    for (var x_1 = 0; x_1 < w; x_1++) {
                        var src = x_1 + y_1 * w;
                        var dst = (ox + x_1 + (y_1 + oy) * width) * 4;
                        data[dst + ch] = cdata[src];
                    }
                }
            }
            if (colorMode === 1 /* ColorMode.Grayscale */ && ch < 1) {
                for (var y_2 = 0; y_2 < h; y_2++) {
                    for (var x_2 = 0; x_2 < w; x_2++) {
                        var src = x_2 + y_2 * w;
                        var dst = (ox + x_2 + (y_2 + oy) * width) * 4;
                        var value = cdata[src];
                        data[dst + 0] = value;
                        data[dst + 1] = value;
                        data[dst + 2] = value;
                    }
                }
            }
            if (colorMode === 2 /* ColorMode.Indexed */) {
                // TODO:
                throw new Error('Indexed pattern color mode not implemented');
            }
        }
        else if (compressionMode === 1) {
            // console.log({ colorMode });
            // require('fs').writeFileSync('zip.bin', Buffer.from(cdata));
            // const data = require('zlib').inflateRawSync(cdata);
            // const data = require('zlib').unzipSync(cdata);
            // console.log(data);
            // throw new Error('Zip compression not supported for pattern');
            // throw new Error('Unsupported pattern compression');
            console.error('Unsupported pattern compression');
            name += ' (failed to decode)';
        }
        else {
            throw new Error('Invalid pattern compression mode');
        }
        ch++;
    }
    // TODO: use canvas instead of data ?
    return { id: id, name: name, x: x, y: y, bounds: { x: left, y: top, w: width, h: height }, data: data };
}
exports.readPattern = readPattern;

},{"./additionalInfo":2,"./helpers":7,"./imageResources":8,"zlib":24}],12:[function(require,module,exports){
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeColor = exports.writePsd = exports.writeSection = exports.writeUnicodeStringWithPadding = exports.writeUnicodeString = exports.writeUnicodeStringWithoutLengthLE = exports.writeUnicodeStringWithoutLength = exports.writePascalString = exports.writeSignature = exports.writeZeros = exports.writeBytes = exports.writeFixedPointPath32 = exports.writeFixedPoint32 = exports.writeFloat64 = exports.writeFloat32 = exports.writeUint32 = exports.writeInt32LE = exports.writeInt32 = exports.writeUint16LE = exports.writeUint16 = exports.writeInt16 = exports.writeUint8 = exports.getWriterBufferNoCopy = exports.getWriterBuffer = exports.createWriter = void 0;
var helpers_1 = require("./helpers");
var additionalInfo_1 = require("./additionalInfo");
var imageResources_1 = require("./imageResources");
function createWriter(size) {
    if (size === void 0) { size = 4096; }
    var buffer = new ArrayBuffer(size);
    var view = new DataView(buffer);
    var offset = 0;
    return { buffer: buffer, view: view, offset: offset };
}
exports.createWriter = createWriter;
function getWriterBuffer(writer) {
    return writer.buffer.slice(0, writer.offset);
}
exports.getWriterBuffer = getWriterBuffer;
function getWriterBufferNoCopy(writer) {
    return new Uint8Array(writer.buffer, 0, writer.offset);
}
exports.getWriterBufferNoCopy = getWriterBufferNoCopy;
function writeUint8(writer, value) {
    var offset = addSize(writer, 1);
    writer.view.setUint8(offset, value);
}
exports.writeUint8 = writeUint8;
function writeInt16(writer, value) {
    var offset = addSize(writer, 2);
    writer.view.setInt16(offset, value, false);
}
exports.writeInt16 = writeInt16;
function writeUint16(writer, value) {
    var offset = addSize(writer, 2);
    writer.view.setUint16(offset, value, false);
}
exports.writeUint16 = writeUint16;
function writeUint16LE(writer, value) {
    var offset = addSize(writer, 2);
    writer.view.setUint16(offset, value, true);
}
exports.writeUint16LE = writeUint16LE;
function writeInt32(writer, value) {
    var offset = addSize(writer, 4);
    writer.view.setInt32(offset, value, false);
}
exports.writeInt32 = writeInt32;
function writeInt32LE(writer, value) {
    var offset = addSize(writer, 4);
    writer.view.setInt32(offset, value, true);
}
exports.writeInt32LE = writeInt32LE;
function writeUint32(writer, value) {
    var offset = addSize(writer, 4);
    writer.view.setUint32(offset, value, false);
}
exports.writeUint32 = writeUint32;
function writeFloat32(writer, value) {
    var offset = addSize(writer, 4);
    writer.view.setFloat32(offset, value, false);
}
exports.writeFloat32 = writeFloat32;
function writeFloat64(writer, value) {
    var offset = addSize(writer, 8);
    writer.view.setFloat64(offset, value, false);
}
exports.writeFloat64 = writeFloat64;
// 32-bit fixed-point number 16.16
function writeFixedPoint32(writer, value) {
    writeInt32(writer, value * (1 << 16));
}
exports.writeFixedPoint32 = writeFixedPoint32;
// 32-bit fixed-point number 8.24
function writeFixedPointPath32(writer, value) {
    writeInt32(writer, value * (1 << 24));
}
exports.writeFixedPointPath32 = writeFixedPointPath32;
function writeBytes(writer, buffer) {
    if (buffer) {
        ensureSize(writer, writer.offset + buffer.length);
        var bytes = new Uint8Array(writer.buffer);
        bytes.set(buffer, writer.offset);
        writer.offset += buffer.length;
    }
}
exports.writeBytes = writeBytes;
function writeZeros(writer, count) {
    for (var i = 0; i < count; i++) {
        writeUint8(writer, 0);
    }
}
exports.writeZeros = writeZeros;
function writeSignature(writer, signature) {
    if (signature.length !== 4)
        throw new Error("Invalid signature: '".concat(signature, "'"));
    for (var i = 0; i < 4; i++) {
        writeUint8(writer, signature.charCodeAt(i));
    }
}
exports.writeSignature = writeSignature;
function writePascalString(writer, text, padTo) {
    var length = text.length;
    if (length > 255)
        throw new Error("String too long");
    writeUint8(writer, length);
    for (var i = 0; i < length; i++) {
        var code = text.charCodeAt(i);
        // writeUint8(writer, code); // for testing
        writeUint8(writer, code < 128 ? code : '?'.charCodeAt(0));
    }
    while (++length % padTo) {
        writeUint8(writer, 0);
    }
}
exports.writePascalString = writePascalString;
function writeUnicodeStringWithoutLength(writer, text) {
    for (var i = 0; i < text.length; i++) {
        writeUint16(writer, text.charCodeAt(i));
    }
}
exports.writeUnicodeStringWithoutLength = writeUnicodeStringWithoutLength;
function writeUnicodeStringWithoutLengthLE(writer, text) {
    for (var i = 0; i < text.length; i++) {
        writeUint16LE(writer, text.charCodeAt(i));
    }
}
exports.writeUnicodeStringWithoutLengthLE = writeUnicodeStringWithoutLengthLE;
function writeUnicodeString(writer, text) {
    writeUint32(writer, text.length);
    writeUnicodeStringWithoutLength(writer, text);
}
exports.writeUnicodeString = writeUnicodeString;
function writeUnicodeStringWithPadding(writer, text) {
    writeUint32(writer, text.length + 1);
    for (var i = 0; i < text.length; i++) {
        writeUint16(writer, text.charCodeAt(i));
    }
    writeUint16(writer, 0);
}
exports.writeUnicodeStringWithPadding = writeUnicodeStringWithPadding;
function getLargestLayerSize(layers) {
    if (layers === void 0) { layers = []; }
    var max = 0;
    for (var _i = 0, layers_1 = layers; _i < layers_1.length; _i++) {
        var layer = layers_1[_i];
        if (layer.canvas || layer.imageData) {
            var _a = getLayerDimentions(layer), width = _a.width, height = _a.height;
            max = Math.max(max, 2 * height + 2 * width * height);
        }
        if (layer.children) {
            max = Math.max(max, getLargestLayerSize(layer.children));
        }
    }
    return max;
}
function writeSection(writer, round, func, writeTotalLength, large) {
    if (writeTotalLength === void 0) { writeTotalLength = false; }
    if (large === void 0) { large = false; }
    if (large)
        writeUint32(writer, 0);
    var offset = writer.offset;
    writeUint32(writer, 0);
    func();
    var length = writer.offset - offset - 4;
    var len = length;
    while ((writer.offset % round) !== 0) {
        writeUint8(writer, 0);
        len++;
    }
    if (writeTotalLength) {
        length = len;
    }
    writer.view.setUint32(offset, length, false);
}
exports.writeSection = writeSection;
function verifyBitCount(target) {
    var _a;
    (_a = target.children) === null || _a === void 0 ? void 0 : _a.forEach(verifyBitCount);
    var data = target.imageData;
    if (data && (data.data instanceof Uint32Array || data.data instanceof Uint16Array)) {
        throw new Error('imageData has incorrect bitDepth');
    }
    if ('mask' in target && target.mask) {
        var data_1 = target.mask.imageData;
        if (data_1 && (data_1.data instanceof Uint32Array || data_1.data instanceof Uint16Array)) {
            throw new Error('mask imageData has incorrect bitDepth');
        }
    }
}
function writePsd(writer, psd, options) {
    var _a;
    if (options === void 0) { options = {}; }
    if (!(+psd.width > 0 && +psd.height > 0))
        throw new Error('Invalid document size');
    if ((psd.width > 30000 || psd.height > 30000) && !options.psb)
        throw new Error('Document size is too large (max is 30000x30000, use PSB format instead)');
    var bitsPerChannel = (_a = psd.bitsPerChannel) !== null && _a !== void 0 ? _a : 8;
    if (bitsPerChannel !== 8)
        throw new Error('bitsPerChannel other than 8 are not supported for writing');
    verifyBitCount(psd);
    var imageResources = psd.imageResources || {};
    var opt = __assign(__assign({}, options), { layerIds: new Set(), layerToId: new Map() });
    if (opt.generateThumbnail) {
        imageResources = __assign(__assign({}, imageResources), { thumbnail: createThumbnail(psd) });
    }
    var imageData = psd.imageData;
    if (!imageData && psd.canvas) {
        imageData = psd.canvas.getContext('2d').getImageData(0, 0, psd.canvas.width, psd.canvas.height);
    }
    if (imageData && (psd.width !== imageData.width || psd.height !== imageData.height))
        throw new Error('Document canvas must have the same size as document');
    var globalAlpha = !!imageData && (0, helpers_1.hasAlpha)(imageData);
    var maxBufferSize = Math.max(getLargestLayerSize(psd.children), 4 * 2 * psd.width * psd.height + 2 * psd.height);
    var tempBuffer = new Uint8Array(maxBufferSize);
    // header
    writeSignature(writer, '8BPS');
    writeUint16(writer, options.psb ? 2 : 1); // version
    writeZeros(writer, 6);
    writeUint16(writer, globalAlpha ? 4 : 3); // channels
    writeUint32(writer, psd.height);
    writeUint32(writer, psd.width);
    writeUint16(writer, bitsPerChannel); // bits per channel
    writeUint16(writer, 3 /* ColorMode.RGB */); // we only support saving RGB right now
    // color mode data
    writeSection(writer, 1, function () {
        // TODO: implement
    });
    // image resources
    writeSection(writer, 1, function () {
        var _loop_1 = function (handler) {
            var has = handler.has(imageResources);
            var count = has === false ? 0 : (has === true ? 1 : has);
            var _loop_2 = function (i) {
                writeSignature(writer, '8BIM');
                writeUint16(writer, handler.key);
                writePascalString(writer, '', 2);
                writeSection(writer, 2, function () { return handler.write(writer, imageResources, i); });
            };
            for (var i = 0; i < count; i++) {
                _loop_2(i);
            }
        };
        for (var _i = 0, resourceHandlers_1 = imageResources_1.resourceHandlers; _i < resourceHandlers_1.length; _i++) {
            var handler = resourceHandlers_1[_i];
            _loop_1(handler);
        }
    });
    // layer and mask info
    writeSection(writer, 2, function () {
        writeLayerInfo(tempBuffer, writer, psd, globalAlpha, opt);
        writeGlobalLayerMaskInfo(writer, psd.globalLayerMaskInfo);
        writeAdditionalLayerInfo(writer, psd, psd, opt);
    }, undefined, !!opt.psb);
    // image data
    var channels = globalAlpha ? [0, 1, 2, 3] : [0, 1, 2];
    var width = imageData ? imageData.width : psd.width;
    var height = imageData ? imageData.height : psd.height;
    var data = { data: new Uint8Array(width * height * 4), width: width, height: height };
    writeUint16(writer, 1 /* Compression.RleCompressed */); // Photoshop doesn't support zip compression of composite image data
    if (helpers_1.RAW_IMAGE_DATA && psd.imageDataRaw) {
        console.log('writing raw image data');
        writeBytes(writer, psd.imageDataRaw);
    }
    else {
        if (imageData)
            data.data.set(new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength));
        // add weird white matte
        if (globalAlpha) {
            var size = data.width * data.height * 4;
            var p = data.data;
            for (var i = 0; i < size; i += 4) {
                var pa = p[i + 3];
                if (pa != 0 && pa != 255) {
                    var a = pa / 255;
                    var ra = 255 * (1 - a);
                    p[i + 0] = p[i + 0] * a + ra;
                    p[i + 1] = p[i + 1] * a + ra;
                    p[i + 2] = p[i + 2] * a + ra;
                }
            }
        }
        writeBytes(writer, (0, helpers_1.writeDataRLE)(tempBuffer, data, channels, !!options.psb));
    }
}
exports.writePsd = writePsd;
function writeLayerInfo(tempBuffer, writer, psd, globalAlpha, options) {
    writeSection(writer, 4, function () {
        var _a;
        var layers = [];
        addChildren(layers, psd.children);
        if (!layers.length)
            layers.push({});
        writeInt16(writer, globalAlpha ? -layers.length : layers.length);
        var layersData = layers.map(function (l, i) { return getChannels(tempBuffer, l, i === 0, options); });
        var _loop_3 = function (layerData) {
            var layer = layerData.layer, top_1 = layerData.top, left = layerData.left, bottom = layerData.bottom, right = layerData.right, channels = layerData.channels;
            writeInt32(writer, top_1);
            writeInt32(writer, left);
            writeInt32(writer, bottom);
            writeInt32(writer, right);
            writeUint16(writer, channels.length);
            for (var _e = 0, channels_1 = channels; _e < channels_1.length; _e++) {
                var c = channels_1[_e];
                writeInt16(writer, c.channelId);
                if (options.psb)
                    writeUint32(writer, 0);
                writeUint32(writer, c.length);
            }
            writeSignature(writer, '8BIM');
            writeSignature(writer, helpers_1.fromBlendMode[layer.blendMode] || 'norm');
            writeUint8(writer, Math.round((0, helpers_1.clamp)((_a = layer.opacity) !== null && _a !== void 0 ? _a : 1, 0, 1) * 255));
            writeUint8(writer, layer.clipping ? 1 : 0);
            var flags = 0x08; // 1 for Photoshop 5.0 and later, tells if bit 4 has useful information
            if (layer.transparencyProtected)
                flags |= 0x01;
            if (layer.hidden)
                flags |= 0x02;
            if (layer.vectorMask || (layer.sectionDivider && layer.sectionDivider.type !== 0 /* SectionDividerType.Other */)) {
                flags |= 0x10; // pixel data irrelevant to appearance of document
            }
            if (layer.effectsOpen)
                flags |= 0x20;
            writeUint8(writer, flags);
            writeUint8(writer, 0); // filler
            writeSection(writer, 1, function () {
                writeLayerMaskData(writer, layer, layerData);
                writeLayerBlendingRanges(writer, psd);
                writePascalString(writer, (layer.name || '').substring(0, 255), 4);
                writeAdditionalLayerInfo(writer, layer, psd, options);
            });
        };
        // layer records
        for (var _i = 0, layersData_1 = layersData; _i < layersData_1.length; _i++) {
            var layerData = layersData_1[_i];
            _loop_3(layerData);
        }
        // layer channel image data
        for (var _b = 0, layersData_2 = layersData; _b < layersData_2.length; _b++) {
            var layerData = layersData_2[_b];
            for (var _c = 0, _d = layerData.channels; _c < _d.length; _c++) {
                var channel = _d[_c];
                writeUint16(writer, channel.compression);
                if (channel.buffer) {
                    writeBytes(writer, channel.buffer);
                }
            }
        }
    }, true, options.psb);
}
function writeLayerMaskData(writer, _a, layerData) {
    var mask = _a.mask;
    writeSection(writer, 1, function () {
        if (!mask)
            return;
        var m = layerData.mask || {};
        writeInt32(writer, m.top || 0);
        writeInt32(writer, m.left || 0);
        writeInt32(writer, m.bottom || 0);
        writeInt32(writer, m.right || 0);
        writeUint8(writer, mask.defaultColor || 0);
        var params = 0;
        if (mask.userMaskDensity !== undefined)
            params |= 1 /* MaskParams.UserMaskDensity */;
        if (mask.userMaskFeather !== undefined)
            params |= 2 /* MaskParams.UserMaskFeather */;
        if (mask.vectorMaskDensity !== undefined)
            params |= 4 /* MaskParams.VectorMaskDensity */;
        if (mask.vectorMaskFeather !== undefined)
            params |= 8 /* MaskParams.VectorMaskFeather */;
        var flags = 0;
        if (mask.disabled)
            flags |= 2 /* LayerMaskFlags.LayerMaskDisabled */;
        if (mask.positionRelativeToLayer)
            flags |= 1 /* LayerMaskFlags.PositionRelativeToLayer */;
        if (mask.fromVectorData)
            flags |= 8 /* LayerMaskFlags.LayerMaskFromRenderingOtherData */;
        if (params)
            flags |= 16 /* LayerMaskFlags.MaskHasParametersAppliedToIt */;
        writeUint8(writer, flags);
        if (params) {
            writeUint8(writer, params);
            if (mask.userMaskDensity !== undefined)
                writeUint8(writer, Math.round(mask.userMaskDensity * 0xff));
            if (mask.userMaskFeather !== undefined)
                writeFloat64(writer, mask.userMaskFeather);
            if (mask.vectorMaskDensity !== undefined)
                writeUint8(writer, Math.round(mask.vectorMaskDensity * 0xff));
            if (mask.vectorMaskFeather !== undefined)
                writeFloat64(writer, mask.vectorMaskFeather);
        }
        // TODO: handle rest of the fields
        writeZeros(writer, 2);
    });
}
function writeLayerBlendingRanges(writer, psd) {
    writeSection(writer, 1, function () {
        writeUint32(writer, 65535);
        writeUint32(writer, 65535);
        var channels = psd.channels || 0; // TODO: use always 4 instead ?
        // channels = 4; // TESTING
        for (var i = 0; i < channels; i++) {
            writeUint32(writer, 65535);
            writeUint32(writer, 65535);
        }
    });
}
function writeGlobalLayerMaskInfo(writer, info) {
    writeSection(writer, 1, function () {
        if (info) {
            writeUint16(writer, info.overlayColorSpace);
            writeUint16(writer, info.colorSpace1);
            writeUint16(writer, info.colorSpace2);
            writeUint16(writer, info.colorSpace3);
            writeUint16(writer, info.colorSpace4);
            writeUint16(writer, info.opacity * 0xff);
            writeUint8(writer, info.kind);
            writeZeros(writer, 3);
        }
    });
}
function writeAdditionalLayerInfo(writer, target, psd, options) {
    var _loop_4 = function (handler) {
        var key = handler.key;
        if (key === 'Txt2' && options.invalidateTextLayers)
            return "continue";
        if (key === 'vmsk' && options.psb)
            key = 'vsms';
        if (handler.has(target)) {
            var large = options.psb && helpers_1.largeAdditionalInfoKeys.indexOf(key) !== -1;
            var writeTotalLength = key !== 'Txt2' && key !== 'cinf' && key !== 'extn';
            var fourBytes = key === 'Txt2' || key === 'luni' || key === 'vmsk' || key === 'artb' || key === 'artd' ||
                key === 'vogk' || key === 'SoLd' || key === 'lnk2' || key === 'vscg' || key === 'vsms' || key === 'GdFl' ||
                key === 'lmfx' || key === 'lrFX' || key === 'cinf' || key === 'PlLd' || key === 'Anno';
            writeSignature(writer, large ? '8B64' : '8BIM');
            writeSignature(writer, key);
            writeSection(writer, fourBytes ? 4 : 2, function () {
                handler.write(writer, target, psd, options);
            }, writeTotalLength, large);
        }
    };
    for (var _i = 0, infoHandlers_1 = additionalInfo_1.infoHandlers; _i < infoHandlers_1.length; _i++) {
        var handler = infoHandlers_1[_i];
        _loop_4(handler);
    }
}
function addChildren(layers, children) {
    if (!children)
        return;
    for (var _i = 0, children_1 = children; _i < children_1.length; _i++) {
        var c = children_1[_i];
        if (c.children && c.canvas)
            throw new Error("Invalid layer, cannot have both 'canvas' and 'children' properties");
        if (c.children && c.imageData)
            throw new Error("Invalid layer, cannot have both 'imageData' and 'children' properties");
        if (c.children) {
            layers.push({
                name: '</Layer group>',
                sectionDivider: {
                    type: 3 /* SectionDividerType.BoundingSectionDivider */,
                },
                // TESTING
                // nameSource: 'lset',
                // id: [4, 0, 0, 8, 11, 0, 0, 0, 0, 14][layers.length] || 0,
                // layerColor: 'none',
                // timestamp: [1611346817.349021, 0, 0, 1611346817.349175, 1611346817.3491833, 0, 0, 0, 0, 1611346817.349832][layers.length] || 0,
                // protected: {},
                // referencePoint: { x: 0, y: 0 },
            });
            addChildren(layers, c.children);
            layers.push(__assign({ sectionDivider: {
                    type: c.opened === false ? 2 /* SectionDividerType.ClosedFolder */ : 1 /* SectionDividerType.OpenFolder */,
                    key: helpers_1.fromBlendMode[c.blendMode] || 'pass',
                    subType: 0,
                } }, c));
        }
        else {
            layers.push(__assign({}, c));
        }
    }
}
function resizeBuffer(writer, size) {
    var newLength = writer.buffer.byteLength;
    do {
        newLength *= 2;
    } while (size > newLength);
    var newBuffer = new ArrayBuffer(newLength);
    var newBytes = new Uint8Array(newBuffer);
    var oldBytes = new Uint8Array(writer.buffer);
    newBytes.set(oldBytes);
    writer.buffer = newBuffer;
    writer.view = new DataView(writer.buffer);
}
function ensureSize(writer, size) {
    if (size > writer.buffer.byteLength) {
        resizeBuffer(writer, size);
    }
}
function addSize(writer, size) {
    var offset = writer.offset;
    ensureSize(writer, writer.offset += size);
    return offset;
}
function createThumbnail(psd) {
    var canvas = (0, helpers_1.createCanvas)(10, 10);
    var scale = 1;
    if (psd.width > psd.height) {
        canvas.width = 160;
        canvas.height = Math.floor(psd.height * (canvas.width / psd.width));
        scale = canvas.width / psd.width;
    }
    else {
        canvas.height = 160;
        canvas.width = Math.floor(psd.width * (canvas.height / psd.height));
        scale = canvas.height / psd.height;
    }
    var context = canvas.getContext('2d');
    context.scale(scale, scale);
    if (psd.imageData) {
        context.drawImage((0, helpers_1.imageDataToCanvas)(psd.imageData), 0, 0);
    }
    else if (psd.canvas) {
        context.drawImage(psd.canvas, 0, 0);
    }
    return canvas;
}
function getChannels(tempBuffer, layer, background, options) {
    var layerData = getLayerChannels(tempBuffer, layer, background, options);
    var mask = layer.mask;
    if (mask) {
        var top_2 = mask.top | 0;
        var left = mask.left | 0;
        var right = mask.right | 0;
        var bottom = mask.bottom | 0;
        var _a = getLayerDimentions(mask), width = _a.width, height = _a.height;
        var imageData = mask.imageData;
        if (!imageData && mask.canvas && width && height) {
            imageData = mask.canvas.getContext('2d').getImageData(0, 0, width, height);
        }
        if (width && height && imageData) {
            right = left + width;
            bottom = top_2 + height;
            if (imageData.width !== width || imageData.height !== height) {
                throw new Error('Invalid imageData dimentions');
            }
            var buffer = void 0;
            var compression = void 0;
            if (helpers_1.RAW_IMAGE_DATA && layer.maskDataRaw) {
                // console.log('written raw layer image data');
                buffer = layer.maskDataRaw;
                compression = 1 /* Compression.RleCompressed */;
            }
            else if (options.compress) {
                buffer = (0, helpers_1.writeDataZipWithoutPrediction)(imageData, [0]);
                compression = 2 /* Compression.ZipWithoutPrediction */;
            }
            else {
                buffer = (0, helpers_1.writeDataRLE)(tempBuffer, imageData, [0], !!options.psb);
                compression = 1 /* Compression.RleCompressed */;
            }
            layerData.mask = { top: top_2, left: left, right: right, bottom: bottom };
            layerData.channels.push({ channelId: -2 /* ChannelID.UserMask */, compression: compression, buffer: buffer, length: 2 + buffer.length });
        }
        else {
            layerData.mask = { top: 0, left: 0, right: 0, bottom: 0 };
        }
    }
    return layerData;
}
function getLayerDimentions(_a) {
    var canvas = _a.canvas, imageData = _a.imageData;
    return imageData || canvas || { width: 0, height: 0 };
}
function cropImageData(data, left, top, width, height) {
    if (data.data instanceof Uint32Array || data.data instanceof Uint16Array) {
        throw new Error('imageData has incorrect bit depth');
    }
    var croppedData = (0, helpers_1.createImageData)(width, height);
    var srcData = data.data;
    var dstData = croppedData.data;
    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            var src = ((x + left) + (y + top) * data.width) * 4;
            var dst = (x + y * width) * 4;
            dstData[dst] = srcData[src];
            dstData[dst + 1] = srcData[src + 1];
            dstData[dst + 2] = srcData[src + 2];
            dstData[dst + 3] = srcData[src + 3];
        }
    }
    return croppedData;
}
function getLayerChannels(tempBuffer, layer, background, options) {
    var _a;
    var top = layer.top | 0;
    var left = layer.left | 0;
    var right = layer.right | 0;
    var bottom = layer.bottom | 0;
    var channels = [
        { channelId: -1 /* ChannelID.Transparency */, compression: 0 /* Compression.RawData */, buffer: undefined, length: 2 },
        { channelId: 0 /* ChannelID.Color0 */, compression: 0 /* Compression.RawData */, buffer: undefined, length: 2 },
        { channelId: 1 /* ChannelID.Color1 */, compression: 0 /* Compression.RawData */, buffer: undefined, length: 2 },
        { channelId: 2 /* ChannelID.Color2 */, compression: 0 /* Compression.RawData */, buffer: undefined, length: 2 },
    ];
    var _b = getLayerDimentions(layer), width = _b.width, height = _b.height;
    if (!(layer.canvas || layer.imageData) || !width || !height) {
        right = left;
        bottom = top;
        return { layer: layer, top: top, left: left, right: right, bottom: bottom, channels: channels };
    }
    right = left + width;
    bottom = top + height;
    var data = layer.imageData || layer.canvas.getContext('2d').getImageData(0, 0, width, height);
    if (options.trimImageData) {
        var trimmed = trimData(data);
        if (trimmed.left !== 0 || trimmed.top !== 0 || trimmed.right !== data.width || trimmed.bottom !== data.height) {
            left += trimmed.left;
            top += trimmed.top;
            right -= (data.width - trimmed.right);
            bottom -= (data.height - trimmed.bottom);
            width = right - left;
            height = bottom - top;
            if (!width || !height)
                return { layer: layer, top: top, left: left, right: right, bottom: bottom, channels: channels };
            data = cropImageData(data, trimmed.left, trimmed.top, width, height);
        }
    }
    var channelIds = [
        0 /* ChannelID.Color0 */,
        1 /* ChannelID.Color1 */,
        2 /* ChannelID.Color2 */,
    ];
    if (!background || options.noBackground || layer.mask || (0, helpers_1.hasAlpha)(data) || (helpers_1.RAW_IMAGE_DATA && ((_a = layer.imageDataRaw) === null || _a === void 0 ? void 0 : _a['-1']))) {
        channelIds.unshift(-1 /* ChannelID.Transparency */);
    }
    channels = channelIds.map(function (channelId) {
        var offset = (0, helpers_1.offsetForChannel)(channelId, false); // TODO: psd.colorMode === ColorMode.CMYK);
        var buffer;
        var compression;
        if (helpers_1.RAW_IMAGE_DATA && layer.imageDataRaw) {
            // console.log('written raw layer image data');
            buffer = layer.imageDataRaw[channelId];
            compression = 1 /* Compression.RleCompressed */;
        }
        else if (options.compress) {
            buffer = (0, helpers_1.writeDataZipWithoutPrediction)(data, [offset]);
            compression = 2 /* Compression.ZipWithoutPrediction */;
        }
        else {
            buffer = (0, helpers_1.writeDataRLE)(tempBuffer, data, [offset], !!options.psb);
            compression = 1 /* Compression.RleCompressed */;
        }
        return { channelId: channelId, compression: compression, buffer: buffer, length: 2 + buffer.length };
    });
    return { layer: layer, top: top, left: left, right: right, bottom: bottom, channels: channels };
}
function isRowEmpty(_a, y, left, right) {
    var data = _a.data, width = _a.width;
    var start = ((y * width + left) * 4 + 3) | 0;
    var end = (start + (right - left) * 4) | 0;
    for (var i = start; i < end; i = (i + 4) | 0) {
        if (data[i] !== 0) {
            return false;
        }
    }
    return true;
}
function isColEmpty(_a, x, top, bottom) {
    var data = _a.data, width = _a.width;
    var stride = (width * 4) | 0;
    var start = (top * stride + x * 4 + 3) | 0;
    for (var y = top, i = start; y < bottom; y++, i = (i + stride) | 0) {
        if (data[i] !== 0) {
            return false;
        }
    }
    return true;
}
function trimData(data) {
    var top = 0;
    var left = 0;
    var right = data.width;
    var bottom = data.height;
    while (top < bottom && isRowEmpty(data, top, left, right))
        top++;
    while (bottom > top && isRowEmpty(data, bottom - 1, left, right))
        bottom--;
    while (left < right && isColEmpty(data, left, top, bottom))
        left++;
    while (right > left && isColEmpty(data, right - 1, top, bottom))
        right--;
    return { top: top, left: left, right: right, bottom: bottom };
}
function writeColor(writer, color) {
    if (!color) {
        writeUint16(writer, 0 /* ColorSpace.RGB */);
        writeZeros(writer, 8);
    }
    else if ('r' in color) {
        writeUint16(writer, 0 /* ColorSpace.RGB */);
        writeUint16(writer, Math.round(color.r * 257));
        writeUint16(writer, Math.round(color.g * 257));
        writeUint16(writer, Math.round(color.b * 257));
        writeUint16(writer, 0);
    }
    else if ('fr' in color) {
        writeUint16(writer, 0 /* ColorSpace.RGB */);
        writeUint16(writer, Math.round(color.fr * 255 * 257));
        writeUint16(writer, Math.round(color.fg * 255 * 257));
        writeUint16(writer, Math.round(color.fb * 255 * 257));
        writeUint16(writer, 0);
    }
    else if ('l' in color) {
        writeUint16(writer, 7 /* ColorSpace.Lab */);
        writeInt16(writer, Math.round(color.l * 10000));
        writeInt16(writer, Math.round(color.a < 0 ? (color.a * 12800) : (color.a * 12700)));
        writeInt16(writer, Math.round(color.b < 0 ? (color.b * 12800) : (color.b * 12700)));
        writeUint16(writer, 0);
    }
    else if ('h' in color) {
        writeUint16(writer, 1 /* ColorSpace.HSB */);
        writeUint16(writer, Math.round(color.h * 0xffff));
        writeUint16(writer, Math.round(color.s * 0xffff));
        writeUint16(writer, Math.round(color.b * 0xffff));
        writeUint16(writer, 0);
    }
    else if ('c' in color) {
        writeUint16(writer, 2 /* ColorSpace.CMYK */);
        writeUint16(writer, Math.round(color.c * 257));
        writeUint16(writer, Math.round(color.m * 257));
        writeUint16(writer, Math.round(color.y * 257));
        writeUint16(writer, Math.round(color.k * 257));
    }
    else {
        writeUint16(writer, 8 /* ColorSpace.Grayscale */);
        writeUint16(writer, Math.round(color.k * 10000 / 255));
        writeZeros(writer, 6);
    }
}
exports.writeColor = writeColor;

},{"./additionalInfo":2,"./helpers":7,"./imageResources":8}],13:[function(require,module,exports){
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeEngineData = exports.decodeEngineData = void 0;
var defaultFont = {
    name: 'MyriadPro-Regular',
    script: 0,
    type: 0,
    synthetic: 0,
};
var defaultParagraphStyle = {
    justification: 'left',
    firstLineIndent: 0,
    startIndent: 0,
    endIndent: 0,
    spaceBefore: 0,
    spaceAfter: 0,
    autoHyphenate: true,
    hyphenatedWordSize: 6,
    preHyphen: 2,
    postHyphen: 2,
    consecutiveHyphens: 8,
    zone: 36,
    wordSpacing: [0.8, 1, 1.33],
    letterSpacing: [0, 0, 0],
    glyphSpacing: [1, 1, 1],
    autoLeading: 1.2,
    leadingType: 0,
    hanging: false,
    burasagari: false,
    kinsokuOrder: 0,
    everyLineComposer: false,
};
var defaultStyle = {
    font: defaultFont,
    fontSize: 12,
    fauxBold: false,
    fauxItalic: false,
    autoLeading: true,
    leading: 0,
    horizontalScale: 1,
    verticalScale: 1,
    tracking: 0,
    autoKerning: true,
    kerning: 0,
    baselineShift: 0,
    fontCaps: 0,
    fontBaseline: 0,
    underline: false,
    strikethrough: false,
    ligatures: true,
    dLigatures: false,
    baselineDirection: 2,
    tsume: 0,
    styleRunAlignment: 2,
    language: 0,
    noBreak: false,
    fillColor: { r: 0, g: 0, b: 0 },
    strokeColor: { r: 0, g: 0, b: 0 },
    fillFlag: true,
    strokeFlag: false,
    fillFirst: true,
    yUnderline: 1,
    outlineWidth: 1,
    characterDirection: 0,
    hindiNumbers: false,
    kashida: 1,
    diacriticPos: 2,
};
var defaultGridInfo = {
    isOn: false,
    show: false,
    size: 18,
    leading: 22,
    color: { r: 0, g: 0, b: 255 },
    leadingFillColor: { r: 0, g: 0, b: 255 },
    alignLineHeightToGridFlags: false,
};
var paragraphStyleKeys = [
    'justification', 'firstLineIndent', 'startIndent', 'endIndent', 'spaceBefore', 'spaceAfter',
    'autoHyphenate', 'hyphenatedWordSize', 'preHyphen', 'postHyphen', 'consecutiveHyphens',
    'zone', 'wordSpacing', 'letterSpacing', 'glyphSpacing', 'autoLeading', 'leadingType',
    'hanging', 'burasagari', 'kinsokuOrder', 'everyLineComposer',
];
var styleKeys = [
    'font', 'fontSize', 'fauxBold', 'fauxItalic', 'autoLeading', 'leading', 'horizontalScale',
    'verticalScale', 'tracking', 'autoKerning', 'kerning', 'baselineShift', 'fontCaps', 'fontBaseline',
    'underline', 'strikethrough', 'ligatures', 'dLigatures', 'baselineDirection', 'tsume',
    'styleRunAlignment', 'language', 'noBreak', 'fillColor', 'strokeColor', 'fillFlag',
    'strokeFlag', 'fillFirst', 'yUnderline', 'outlineWidth', 'characterDirection', 'hindiNumbers',
    'kashida', 'diacriticPos',
];
var antialias = ['none', 'crisp', 'strong', 'smooth', 'sharp'];
var justification = ['left', 'right', 'center'];
function upperFirst(value) {
    return value.substring(0, 1).toUpperCase() + value.substring(1);
}
function decodeColor(color) {
    var c = color.Values;
    switch (color.Type) {
        case 0: return { k: c[1] * 255 }; // grayscale (alpha?)
        case 1: return c[0] === 1 ?
            { r: c[1] * 255, g: c[2] * 255, b: c[3] * 255 } : // rgb
            { r: c[1] * 255, g: c[2] * 255, b: c[3] * 255, a: c[0] * 255 }; // rgba
        case 2: return { c: c[1] * 255, m: c[2] * 255, y: c[3] * 255, k: c[4] * 255 }; // cmyk (alpha?)
        default: throw new Error('Unknown color type in text layer');
    }
}
function encodeColor(color) {
    if (!color) {
        return { Type: 1, Values: [0, 0, 0, 0] };
    }
    else if ('r' in color) {
        return { Type: 1, Values: ['a' in color ? color.a / 255 : 1, color.r / 255, color.g / 255, color.b / 255] };
    }
    else if ('c' in color) {
        return { Type: 2, Values: [1, color.c / 255, color.m / 255, color.y / 255, color.k / 255] };
    }
    else if ('k' in color) {
        return { Type: 0, Values: [1, color.k / 255] };
    }
    else {
        throw new Error('Invalid color type in text layer');
    }
}
function arraysEqual(a, b) {
    if (!a || !b)
        return false;
    if (a.length !== b.length)
        return false;
    for (var i = 0; i < a.length; i++)
        if (a[i] !== b[i])
            return false;
    return true;
}
function objectsEqual(a, b) {
    if (!a || !b)
        return false;
    for (var _i = 0, _a = Object.keys(a); _i < _a.length; _i++) {
        var key = _a[_i];
        if (a[key] !== b[key])
            return false;
    }
    for (var _b = 0, _c = Object.keys(b); _b < _c.length; _b++) {
        var key = _c[_b];
        if (a[key] !== b[key])
            return false;
    }
    return true;
}
function findOrAddFont(fonts, font) {
    for (var i = 0; i < fonts.length; i++) {
        if (fonts[i].name === font.name)
            return i;
    }
    fonts.push(font);
    return fonts.length - 1;
}
function decodeObject(obj, keys, fonts) {
    var result = {};
    for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
        var key = keys_1[_i];
        var Key = upperFirst(key);
        if (obj[Key] === undefined)
            continue;
        if (key === 'justification') {
            result[key] = justification[obj[Key]];
        }
        else if (key === 'font') {
            result[key] = fonts[obj[Key]];
        }
        else if (key === 'fillColor' || key === 'strokeColor') {
            result[key] = decodeColor(obj[Key]);
        }
        else {
            result[key] = obj[Key];
        }
    }
    return result;
}
function encodeObject(obj, keys, fonts) {
    var _a;
    var result = {};
    for (var _i = 0, keys_2 = keys; _i < keys_2.length; _i++) {
        var key = keys_2[_i];
        var Key = upperFirst(key);
        if (obj[key] === undefined)
            continue;
        if (key === 'justification') {
            result[Key] = justification.indexOf((_a = obj[key]) !== null && _a !== void 0 ? _a : 'left');
        }
        else if (key === 'font') {
            result[Key] = findOrAddFont(fonts, obj[key]);
        }
        else if (key === 'fillColor' || key === 'strokeColor') {
            result[Key] = encodeColor(obj[key]);
        }
        else {
            result[Key] = obj[key];
        }
    }
    return result;
}
function decodeParagraphStyle(obj, fonts) {
    return decodeObject(obj, paragraphStyleKeys, fonts);
}
function decodeStyle(obj, fonts) {
    return decodeObject(obj, styleKeys, fonts);
}
function encodeParagraphStyle(obj, fonts) {
    return encodeObject(obj, paragraphStyleKeys, fonts);
}
function encodeStyle(obj, fonts) {
    return encodeObject(obj, styleKeys, fonts);
}
function deduplicateValues(base, runs, keys) {
    if (!runs.length)
        return;
    var _loop_1 = function (key) {
        var value = runs[0].style[key];
        if (value !== undefined) {
            var identical = false;
            if (Array.isArray(value)) {
                identical = runs.every(function (r) { return arraysEqual(r.style[key], value); });
            }
            else if (typeof value === 'object') {
                identical = runs.every(function (r) { return objectsEqual(r.style[key], value); });
            }
            else {
                identical = runs.every(function (r) { return r.style[key] === value; });
            }
            if (identical) {
                base[key] = value;
            }
        }
        var styleValue = base[key];
        if (styleValue !== undefined) {
            for (var _a = 0, runs_1 = runs; _a < runs_1.length; _a++) {
                var r = runs_1[_a];
                var same = false;
                if (Array.isArray(value)) {
                    same = arraysEqual(r.style[key], value);
                }
                else if (typeof value === 'object') {
                    same = objectsEqual(r.style[key], value);
                }
                else {
                    same = r.style[key] === value;
                }
                if (same)
                    delete r.style[key];
            }
        }
    };
    for (var _i = 0, keys_3 = keys; _i < keys_3.length; _i++) {
        var key = keys_3[_i];
        _loop_1(key);
    }
    if (runs.every(function (x) { return Object.keys(x.style).length === 0; })) {
        runs.length = 0;
    }
}
function decodeEngineData(engineData) {
    var _a, _b, _c, _d, _e, _f;
    // console.log('engineData', require('util').inspect(engineData, false, 99, true));
    var engineDict = engineData.EngineDict;
    var resourceDict = engineData.ResourceDict;
    var fonts = resourceDict.FontSet.map(function (f) { return ({
        name: f.Name,
        script: f.Script,
        type: f.FontType,
        synthetic: f.Synthetic,
    }); });
    var text = engineDict.Editor.Text.replace(/\r/g, '\n');
    var removedCharacters = 0;
    while (/\n$/.test(text)) {
        text = text.substr(0, text.length - 1);
        removedCharacters++;
    }
    var result = {
        text: text,
        antiAlias: (_a = antialias[engineDict.AntiAlias]) !== null && _a !== void 0 ? _a : 'smooth',
        useFractionalGlyphWidths: !!engineDict.UseFractionalGlyphWidths,
        superscriptSize: resourceDict.SuperscriptSize,
        superscriptPosition: resourceDict.SuperscriptPosition,
        subscriptSize: resourceDict.SubscriptSize,
        subscriptPosition: resourceDict.SubscriptPosition,
        smallCapSize: resourceDict.SmallCapSize,
    };
    // shape
    var photoshop = (_f = (_e = (_d = (_c = (_b = engineDict.Rendered) === null || _b === void 0 ? void 0 : _b.Shapes) === null || _c === void 0 ? void 0 : _c.Children) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.Cookie) === null || _f === void 0 ? void 0 : _f.Photoshop;
    if (photoshop) {
        result.shapeType = photoshop.ShapeType === 1 ? 'box' : 'point';
        if (photoshop.PointBase)
            result.pointBase = photoshop.PointBase;
        if (photoshop.BoxBounds)
            result.boxBounds = photoshop.BoxBounds;
    }
    // paragraph style
    // const theNormalParagraphSheet = resourceDict.TheNormalParagraphSheet;
    // const paragraphSheetSet = resourceDict.ParagraphSheetSet;
    // const paragraphProperties = paragraphSheetSet[theNormalParagraphSheet].Properties;
    var paragraphRun = engineData.EngineDict.ParagraphRun;
    result.paragraphStyle = {}; // decodeParagraphStyle(paragraphProperties, fonts);
    result.paragraphStyleRuns = [];
    for (var i = 0; i < paragraphRun.RunArray.length; i++) {
        var run_1 = paragraphRun.RunArray[i];
        var length_1 = paragraphRun.RunLengthArray[i];
        var style = decodeParagraphStyle(run_1.ParagraphSheet.Properties, fonts);
        // const adjustments = {
        //   axis: run.Adjustments.Axis,
        //   xy: run.Adjustments.XY,
        // };
        result.paragraphStyleRuns.push({ length: length_1, style: style /*, adjustments*/ });
    }
    for (var counter = removedCharacters; result.paragraphStyleRuns.length && counter > 0; counter--) {
        if (--result.paragraphStyleRuns[result.paragraphStyleRuns.length - 1].length === 0) {
            result.paragraphStyleRuns.pop();
        }
    }
    deduplicateValues(result.paragraphStyle, result.paragraphStyleRuns, paragraphStyleKeys);
    if (!result.paragraphStyleRuns.length)
        delete result.paragraphStyleRuns;
    // style
    // const theNormalStyleSheet = resourceDict.TheNormalStyleSheet;
    // const styleSheetSet = resourceDict.StyleSheetSet;
    // const styleSheetData = styleSheetSet[theNormalStyleSheet].StyleSheetData;
    var styleRun = engineData.EngineDict.StyleRun;
    result.style = {}; // decodeStyle(styleSheetData, fonts);
    result.styleRuns = [];
    for (var i = 0; i < styleRun.RunArray.length; i++) {
        var length_2 = styleRun.RunLengthArray[i];
        var style = decodeStyle(styleRun.RunArray[i].StyleSheet.StyleSheetData, fonts);
        if (!style.font)
            style.font = fonts[0];
        result.styleRuns.push({ length: length_2, style: style });
    }
    for (var counter = removedCharacters; result.styleRuns.length && counter > 0; counter--) {
        if (--result.styleRuns[result.styleRuns.length - 1].length === 0) {
            result.styleRuns.pop();
        }
    }
    deduplicateValues(result.style, result.styleRuns, styleKeys);
    if (!result.styleRuns.length)
        delete result.styleRuns;
    return result;
}
exports.decodeEngineData = decodeEngineData;
function encodeEngineData(data) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    var text = "".concat((data.text || '').replace(/\r?\n/g, '\r'), "\r");
    var fonts = [
        { name: 'AdobeInvisFont', script: 0, type: 0, synthetic: 0 },
    ];
    var defFont = ((_a = data.style) === null || _a === void 0 ? void 0 : _a.font) || ((_c = (_b = data.styleRuns) === null || _b === void 0 ? void 0 : _b.find(function (s) { return s.style.font; })) === null || _c === void 0 ? void 0 : _c.style.font) || defaultFont;
    var paragraphRunArray = [];
    var paragraphRunLengthArray = [];
    var paragraphRuns = data.paragraphStyleRuns;
    if (paragraphRuns && paragraphRuns.length) {
        var leftLength_1 = text.length;
        for (var _i = 0, paragraphRuns_1 = paragraphRuns; _i < paragraphRuns_1.length; _i++) {
            var run_2 = paragraphRuns_1[_i];
            var runLength = Math.min(run_2.length, leftLength_1);
            leftLength_1 -= runLength;
            if (!runLength)
                continue; // ignore 0 size runs
            // extend last run if it's only for trailing \r
            if (leftLength_1 === 1 && run_2 === paragraphRuns[paragraphRuns.length - 1]) {
                runLength++;
                leftLength_1--;
            }
            paragraphRunLengthArray.push(runLength);
            paragraphRunArray.push({
                ParagraphSheet: {
                    DefaultStyleSheet: 0,
                    Properties: encodeParagraphStyle(__assign(__assign(__assign({}, defaultParagraphStyle), data.paragraphStyle), run_2.style), fonts),
                },
                Adjustments: { Axis: [1, 0, 1], XY: [0, 0] },
            });
        }
        if (leftLength_1) {
            paragraphRunLengthArray.push(leftLength_1);
            paragraphRunArray.push({
                ParagraphSheet: {
                    DefaultStyleSheet: 0,
                    Properties: encodeParagraphStyle(__assign(__assign({}, defaultParagraphStyle), data.paragraphStyle), fonts),
                },
                Adjustments: { Axis: [1, 0, 1], XY: [0, 0] },
            });
        }
    }
    else {
        for (var i = 0, last = 0; i < text.length; i++) {
            if (text.charCodeAt(i) === 13) { // \r
                paragraphRunLengthArray.push(i - last + 1);
                paragraphRunArray.push({
                    ParagraphSheet: {
                        DefaultStyleSheet: 0,
                        Properties: encodeParagraphStyle(__assign(__assign({}, defaultParagraphStyle), data.paragraphStyle), fonts),
                    },
                    Adjustments: { Axis: [1, 0, 1], XY: [0, 0] },
                });
                last = i + 1;
            }
        }
    }
    var styleSheetData = encodeStyle(__assign(__assign({}, defaultStyle), { font: defFont }), fonts);
    var styleRuns = data.styleRuns || [{ length: text.length, style: data.style || {} }];
    var styleRunArray = [];
    var styleRunLengthArray = [];
    var leftLength = text.length;
    for (var _o = 0, styleRuns_1 = styleRuns; _o < styleRuns_1.length; _o++) {
        var run_3 = styleRuns_1[_o];
        var runLength = Math.min(run_3.length, leftLength);
        leftLength -= runLength;
        if (!runLength)
            continue; // ignore 0 size runs
        // extend last run if it's only for trailing \r
        if (leftLength === 1 && run_3 === styleRuns[styleRuns.length - 1]) {
            runLength++;
            leftLength--;
        }
        styleRunLengthArray.push(runLength);
        styleRunArray.push({
            StyleSheet: {
                StyleSheetData: encodeStyle(__assign(__assign({ kerning: 0, autoKerning: true, fillColor: { r: 0, g: 0, b: 0 } }, data.style), run_3.style), fonts),
            },
        });
    }
    // add extra run to the end if existing ones didn't fill it up
    if (leftLength && styleRuns.length) {
        styleRunLengthArray.push(leftLength);
        styleRunArray.push({
            StyleSheet: {
                StyleSheetData: encodeStyle(__assign({ kerning: 0, autoKerning: true, fillColor: { r: 0, g: 0, b: 0 } }, data.style), fonts),
            },
        });
    }
    var gridInfo = __assign(__assign({}, defaultGridInfo), data.gridInfo);
    var WritingDirection = data.orientation === 'vertical' ? 2 : 0;
    var Procession = data.orientation === 'vertical' ? 1 : 0;
    var ShapeType = data.shapeType === 'box' ? 1 : 0;
    var Photoshop = {
        ShapeType: ShapeType,
    };
    if (ShapeType === 0) {
        Photoshop.PointBase = data.pointBase || [0, 0];
    }
    else {
        Photoshop.BoxBounds = data.boxBounds || [0, 0, 0, 0];
    }
    // needed for correct order of properties
    Photoshop.Base = {
        ShapeType: ShapeType,
        TransformPoint0: [1, 0],
        TransformPoint1: [0, 1],
        TransformPoint2: [0, 0],
    };
    var defaultResources = {
        KinsokuSet: [
            {
                Name: 'PhotoshopKinsokuHard',
                NoStart: '、。，．・：；？！ー―’”）〕］｝〉》」』】ヽヾゝゞ々ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ゛゜?!)]},.:;℃℉¢％‰',
                NoEnd: '‘“（〔［｛〈《「『【([{￥＄£＠§〒＃',
                Keep: '―‥',
                Hanging: '、。.,',
            },
            {
                Name: 'PhotoshopKinsokuSoft',
                NoStart: '、。，．・：；？！’”）〕］｝〉》」』】ヽヾゝゞ々',
                NoEnd: '‘“（〔［｛〈《「『【',
                Keep: '―‥',
                Hanging: '、。.,',
            },
        ],
        MojiKumiSet: [
            { InternalName: 'Photoshop6MojiKumiSet1' },
            { InternalName: 'Photoshop6MojiKumiSet2' },
            { InternalName: 'Photoshop6MojiKumiSet3' },
            { InternalName: 'Photoshop6MojiKumiSet4' },
        ],
        TheNormalStyleSheet: 0,
        TheNormalParagraphSheet: 0,
        ParagraphSheetSet: [
            {
                Name: 'Normal RGB',
                DefaultStyleSheet: 0,
                Properties: encodeParagraphStyle(__assign(__assign({}, defaultParagraphStyle), data.paragraphStyle), fonts),
            },
        ],
        StyleSheetSet: [
            {
                Name: 'Normal RGB',
                StyleSheetData: styleSheetData,
            },
        ],
        FontSet: fonts.map(function (f) { return ({
            Name: f.name,
            Script: f.script || 0,
            FontType: f.type || 0,
            Synthetic: f.synthetic || 0,
        }); }),
        SuperscriptSize: (_d = data.superscriptSize) !== null && _d !== void 0 ? _d : 0.583,
        SuperscriptPosition: (_e = data.superscriptPosition) !== null && _e !== void 0 ? _e : 0.333,
        SubscriptSize: (_f = data.subscriptSize) !== null && _f !== void 0 ? _f : 0.583,
        SubscriptPosition: (_g = data.subscriptPosition) !== null && _g !== void 0 ? _g : 0.333,
        SmallCapSize: (_h = data.smallCapSize) !== null && _h !== void 0 ? _h : 0.7,
    };
    var engineData = {
        EngineDict: {
            Editor: { Text: text },
            ParagraphRun: {
                DefaultRunData: {
                    ParagraphSheet: { DefaultStyleSheet: 0, Properties: {} },
                    Adjustments: { Axis: [1, 0, 1], XY: [0, 0] },
                },
                RunArray: paragraphRunArray,
                RunLengthArray: paragraphRunLengthArray,
                IsJoinable: 1,
            },
            StyleRun: {
                DefaultRunData: { StyleSheet: { StyleSheetData: {} } },
                RunArray: styleRunArray,
                RunLengthArray: styleRunLengthArray,
                IsJoinable: 2,
            },
            GridInfo: {
                GridIsOn: !!gridInfo.isOn,
                ShowGrid: !!gridInfo.show,
                GridSize: (_j = gridInfo.size) !== null && _j !== void 0 ? _j : 18,
                GridLeading: (_k = gridInfo.leading) !== null && _k !== void 0 ? _k : 22,
                GridColor: encodeColor(gridInfo.color),
                GridLeadingFillColor: encodeColor(gridInfo.color),
                AlignLineHeightToGridFlags: !!gridInfo.alignLineHeightToGridFlags,
            },
            AntiAlias: antialias.indexOf((_l = data.antiAlias) !== null && _l !== void 0 ? _l : 'sharp'),
            UseFractionalGlyphWidths: (_m = data.useFractionalGlyphWidths) !== null && _m !== void 0 ? _m : true,
            Rendered: {
                Version: 1,
                Shapes: {
                    WritingDirection: WritingDirection,
                    Children: [
                        {
                            ShapeType: ShapeType,
                            Procession: Procession,
                            Lines: { WritingDirection: WritingDirection, Children: [] },
                            Cookie: { Photoshop: Photoshop },
                        },
                    ],
                },
            },
        },
        ResourceDict: __assign({}, defaultResources),
        DocumentResources: __assign({}, defaultResources),
    };
    // console.log('encodeEngineData', require('util').inspect(engineData, false, 99, true));
    return engineData;
}
exports.encodeEngineData = encodeEngineData;

},{}],14:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeString = exports.encodeString = exports.encodeStringTo = exports.stringLengthInBytes = void 0;
function charLengthInBytes(code) {
    if ((code & 0xffffff80) === 0) {
        return 1;
    }
    else if ((code & 0xfffff800) === 0) {
        return 2;
    }
    else if ((code & 0xffff0000) === 0) {
        return 3;
    }
    else {
        return 4;
    }
}
function stringLengthInBytes(value) {
    var result = 0;
    for (var i = 0; i < value.length; i++) {
        var code = value.charCodeAt(i);
        // high surrogate
        if (code >= 0xd800 && code <= 0xdbff) {
            if ((i + 1) < value.length) {
                var extra = value.charCodeAt(i + 1);
                // low surrogate
                if ((extra & 0xfc00) === 0xdc00) {
                    i++;
                    result += charLengthInBytes(((code & 0x3ff) << 10) + (extra & 0x3ff) + 0x10000);
                }
            }
        }
        else {
            result += charLengthInBytes(code);
        }
    }
    return result;
}
exports.stringLengthInBytes = stringLengthInBytes;
function writeCharacter(buffer, offset, code) {
    var length = charLengthInBytes(code);
    switch (length) {
        case 1:
            buffer[offset] = code;
            break;
        case 2:
            buffer[offset] = ((code >> 6) & 0x1f) | 0xc0;
            buffer[offset + 1] = (code & 0x3f) | 0x80;
            break;
        case 3:
            buffer[offset] = ((code >> 12) & 0x0f) | 0xe0;
            buffer[offset + 1] = ((code >> 6) & 0x3f) | 0x80;
            buffer[offset + 2] = (code & 0x3f) | 0x80;
            break;
        default:
            buffer[offset] = ((code >> 18) & 0x07) | 0xf0;
            buffer[offset + 1] = ((code >> 12) & 0x3f) | 0x80;
            buffer[offset + 2] = ((code >> 6) & 0x3f) | 0x80;
            buffer[offset + 3] = (code & 0x3f) | 0x80;
            break;
    }
    return length;
}
function encodeStringTo(buffer, offset, value) {
    for (var i = 0; i < value.length; i++) {
        var code = value.charCodeAt(i);
        // high surrogate
        if (code >= 0xd800 && code <= 0xdbff) {
            if ((i + 1) < value.length) {
                var extra = value.charCodeAt(i + 1);
                // low surrogate
                if ((extra & 0xfc00) === 0xdc00) {
                    i++;
                    var fullCode = ((code & 0x3ff) << 10) + (extra & 0x3ff) + 0x10000;
                    offset += writeCharacter(buffer, offset, fullCode);
                }
            }
        }
        else {
            offset += writeCharacter(buffer, offset, code);
        }
    }
    return offset;
}
exports.encodeStringTo = encodeStringTo;
function encodeString(value) {
    if (value.length > 1000 && typeof TextEncoder !== 'undefined') {
        return (new TextEncoder()).encode(value);
    }
    var buffer = new Uint8Array(stringLengthInBytes(value));
    encodeStringTo(buffer, 0, value);
    return buffer;
}
exports.encodeString = encodeString;
function continuationByte(buffer, index) {
    if (index >= buffer.length) {
        throw Error('Invalid byte index');
    }
    var continuationByte = buffer[index];
    if ((continuationByte & 0xC0) === 0x80) {
        return continuationByte & 0x3F;
    }
    else {
        throw Error('Invalid continuation byte');
    }
}
function decodeString(value) {
    if (value.byteLength > 1000 && typeof TextDecoder !== 'undefined') {
        return (new TextDecoder()).decode(value);
    }
    var result = [];
    for (var i = 0; i < value.length;) {
        var byte1 = value[i++];
        var code = void 0;
        if ((byte1 & 0x80) === 0) {
            code = byte1;
        }
        else if ((byte1 & 0xe0) === 0xc0) {
            var byte2 = continuationByte(value, i++);
            code = ((byte1 & 0x1f) << 6) | byte2;
            if (code < 0x80) {
                throw Error('Invalid continuation byte');
            }
        }
        else if ((byte1 & 0xf0) === 0xe0) {
            var byte2 = continuationByte(value, i++);
            var byte3 = continuationByte(value, i++);
            code = ((byte1 & 0x0f) << 12) | (byte2 << 6) | byte3;
            if (code < 0x0800) {
                throw Error('Invalid continuation byte');
            }
            if (code >= 0xd800 && code <= 0xdfff) {
                throw Error("Lone surrogate U+".concat(code.toString(16).toUpperCase(), " is not a scalar value"));
            }
        }
        else if ((byte1 & 0xf8) === 0xf0) {
            var byte2 = continuationByte(value, i++);
            var byte3 = continuationByte(value, i++);
            var byte4 = continuationByte(value, i++);
            code = ((byte1 & 0x0f) << 0x12) | (byte2 << 0x0c) | (byte3 << 0x06) | byte4;
            if (code < 0x010000 || code > 0x10ffff) {
                throw Error('Invalid continuation byte');
            }
        }
        else {
            throw Error('Invalid UTF-8 detected');
        }
        if (code > 0xffff) {
            code -= 0x10000;
            result.push(String.fromCharCode(code >>> 10 & 0x3ff | 0xd800));
            code = 0xdc00 | code & 0x3ff;
        }
        result.push(String.fromCharCode(code));
    }
    return result.join('');
}
exports.decodeString = decodeString;

},{}],15:[function(require,module,exports){

/**
 * Array#filter.
 *
 * @param {Array} arr
 * @param {Function} fn
 * @param {Object=} self
 * @return {Array}
 * @throw TypeError
 */

module.exports = function (arr, fn, self) {
  if (arr.filter) return arr.filter(fn, self);
  if (void 0 === arr || null === arr) throw new TypeError;
  if ('function' != typeof fn) throw new TypeError;
  var ret = [];
  for (var i = 0; i < arr.length; i++) {
    if (!hasOwn.call(arr, i)) continue;
    var val = arr[i];
    if (fn.call(self, val, i, arr)) ret.push(val);
  }
  return ret;
};

var hasOwn = Object.prototype.hasOwnProperty;

},{}],16:[function(require,module,exports){
(function (global){(function (){
'use strict';

var objectAssign = require('object-assign');

// compare and isBuffer taken from https://github.com/feross/buffer/blob/680e9e5e488f22aac27599a57dc844a6315928dd/index.js
// original notice:

/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
function compare(a, b) {
  if (a === b) {
    return 0;
  }

  var x = a.length;
  var y = b.length;

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i];
      y = b[i];
      break;
    }
  }

  if (x < y) {
    return -1;
  }
  if (y < x) {
    return 1;
  }
  return 0;
}
function isBuffer(b) {
  if (global.Buffer && typeof global.Buffer.isBuffer === 'function') {
    return global.Buffer.isBuffer(b);
  }
  return !!(b != null && b._isBuffer);
}

// based on node assert, original notice:
// NB: The URL to the CommonJS spec is kept just for tradition.
//     node-assert has evolved a lot since then, both in API and behavior.

// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
//
// THIS IS NOT TESTED NOR LIKELY TO WORK OUTSIDE V8!
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

var util = require('util/');
var hasOwn = Object.prototype.hasOwnProperty;
var pSlice = Array.prototype.slice;
var functionsHaveNames = (function () {
  return function foo() {}.name === 'foo';
}());
function pToString (obj) {
  return Object.prototype.toString.call(obj);
}
function isView(arrbuf) {
  if (isBuffer(arrbuf)) {
    return false;
  }
  if (typeof global.ArrayBuffer !== 'function') {
    return false;
  }
  if (typeof ArrayBuffer.isView === 'function') {
    return ArrayBuffer.isView(arrbuf);
  }
  if (!arrbuf) {
    return false;
  }
  if (arrbuf instanceof DataView) {
    return true;
  }
  if (arrbuf.buffer && arrbuf.buffer instanceof ArrayBuffer) {
    return true;
  }
  return false;
}
// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

var regex = /\s*function\s+([^\(\s]*)\s*/;
// based on https://github.com/ljharb/function.prototype.name/blob/adeeeec8bfcc6068b187d7d9fb3d5bb1d3a30899/implementation.js
function getName(func) {
  if (!util.isFunction(func)) {
    return;
  }
  if (functionsHaveNames) {
    return func.name;
  }
  var str = func.toString();
  var match = str.match(regex);
  return match && match[1];
}
assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  if (options.message) {
    this.message = options.message;
    this.generatedMessage = false;
  } else {
    this.message = getMessage(this);
    this.generatedMessage = true;
  }
  var stackStartFunction = options.stackStartFunction || fail;
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  } else {
    // non v8 browsers so we can have a stacktrace
    var err = new Error();
    if (err.stack) {
      var out = err.stack;

      // try to strip useless frames
      var fn_name = getName(stackStartFunction);
      var idx = out.indexOf('\n' + fn_name);
      if (idx >= 0) {
        // once we have located the function frame
        // we need to strip out everything before it (and its line)
        var next_line = out.indexOf('\n', idx + 1);
        out = out.substring(next_line + 1);
      }

      this.stack = out;
    }
  }
};

// assert.AssertionError instanceof Error
util.inherits(assert.AssertionError, Error);

function truncate(s, n) {
  if (typeof s === 'string') {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}
function inspect(something) {
  if (functionsHaveNames || !util.isFunction(something)) {
    return util.inspect(something);
  }
  var rawname = getName(something);
  var name = rawname ? ': ' + rawname : '';
  return '[Function' +  name + ']';
}
function getMessage(self) {
  return truncate(inspect(self.actual), 128) + ' ' +
         self.operator + ' ' +
         truncate(inspect(self.expected), 128);
}

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, !!guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected, false)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

assert.deepStrictEqual = function deepStrictEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected, true)) {
    fail(actual, expected, message, 'deepStrictEqual', assert.deepStrictEqual);
  }
};

function _deepEqual(actual, expected, strict, memos) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;
  } else if (isBuffer(actual) && isBuffer(expected)) {
    return compare(actual, expected) === 0;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (util.isDate(actual) && util.isDate(expected)) {
    return actual.getTime() === expected.getTime();

  // 7.3 If the expected value is a RegExp object, the actual value is
  // equivalent if it is also a RegExp object with the same source and
  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
  } else if (util.isRegExp(actual) && util.isRegExp(expected)) {
    return actual.source === expected.source &&
           actual.global === expected.global &&
           actual.multiline === expected.multiline &&
           actual.lastIndex === expected.lastIndex &&
           actual.ignoreCase === expected.ignoreCase;

  // 7.4. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if ((actual === null || typeof actual !== 'object') &&
             (expected === null || typeof expected !== 'object')) {
    return strict ? actual === expected : actual == expected;

  // If both values are instances of typed arrays, wrap their underlying
  // ArrayBuffers in a Buffer each to increase performance
  // This optimization requires the arrays to have the same type as checked by
  // Object.prototype.toString (aka pToString). Never perform binary
  // comparisons for Float*Arrays, though, since e.g. +0 === -0 but their
  // bit patterns are not identical.
  } else if (isView(actual) && isView(expected) &&
             pToString(actual) === pToString(expected) &&
             !(actual instanceof Float32Array ||
               actual instanceof Float64Array)) {
    return compare(new Uint8Array(actual.buffer),
                   new Uint8Array(expected.buffer)) === 0;

  // 7.5 For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else if (isBuffer(actual) !== isBuffer(expected)) {
    return false;
  } else {
    memos = memos || {actual: [], expected: []};

    var actualIndex = memos.actual.indexOf(actual);
    if (actualIndex !== -1) {
      if (actualIndex === memos.expected.indexOf(expected)) {
        return true;
      }
    }

    memos.actual.push(actual);
    memos.expected.push(expected);

    return objEquiv(actual, expected, strict, memos);
  }
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b, strict, actualVisitedObjects) {
  if (a === null || a === undefined || b === null || b === undefined)
    return false;
  // if one is a primitive, the other must be same
  if (util.isPrimitive(a) || util.isPrimitive(b))
    return a === b;
  if (strict && Object.getPrototypeOf(a) !== Object.getPrototypeOf(b))
    return false;
  var aIsArgs = isArguments(a);
  var bIsArgs = isArguments(b);
  if ((aIsArgs && !bIsArgs) || (!aIsArgs && bIsArgs))
    return false;
  if (aIsArgs) {
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b, strict);
  }
  var ka = objectKeys(a);
  var kb = objectKeys(b);
  var key, i;
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length !== kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] !== kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key], strict, actualVisitedObjects))
      return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected, false)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

assert.notDeepStrictEqual = notDeepStrictEqual;
function notDeepStrictEqual(actual, expected, message) {
  if (_deepEqual(actual, expected, true)) {
    fail(actual, expected, message, 'notDeepStrictEqual', notDeepStrictEqual);
  }
}


// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (Object.prototype.toString.call(expected) == '[object RegExp]') {
    return expected.test(actual);
  }

  try {
    if (actual instanceof expected) {
      return true;
    }
  } catch (e) {
    // Ignore.  The instanceof check doesn't work for arrow functions.
  }

  if (Error.isPrototypeOf(expected)) {
    return false;
  }

  return expected.call({}, actual) === true;
}

function _tryBlock(block) {
  var error;
  try {
    block();
  } catch (e) {
    error = e;
  }
  return error;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (typeof block !== 'function') {
    throw new TypeError('"block" argument must be a function');
  }

  if (typeof expected === 'string') {
    message = expected;
    expected = null;
  }

  actual = _tryBlock(block);

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail(actual, expected, 'Missing expected exception' + message);
  }

  var userProvidedMessage = typeof message === 'string';
  var isUnwantedException = !shouldThrow && util.isError(actual);
  var isUnexpectedException = !shouldThrow && actual && !expected;

  if ((isUnwantedException &&
      userProvidedMessage &&
      expectedException(actual, expected)) ||
      isUnexpectedException) {
    fail(actual, expected, 'Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws(true, block, error, message);
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/error, /*optional*/message) {
  _throws(false, block, error, message);
};

assert.ifError = function(err) { if (err) throw err; };

// Expose a strict only variant of assert
function strict(value, message) {
  if (!value) fail(value, true, message, '==', strict);
}
assert.strict = objectAssign(strict, assert, {
  equal: assert.strictEqual,
  deepEqual: assert.deepStrictEqual,
  notEqual: assert.notStrictEqual,
  notDeepEqual: assert.notDeepStrictEqual
});
assert.strict.strict = assert.strict;

var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    if (hasOwn.call(obj, key)) keys.push(key);
  }
  return keys;
};

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"object-assign":53,"util/":19}],17:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],18:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],19:[function(require,module,exports){
(function (process,global){(function (){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this)}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":18,"_process":54,"inherits":17}],20:[function(require,module,exports){
(function (global){(function (){
'use strict';

var filter = require('array-filter');

module.exports = function availableTypedArrays() {
	return filter([
		'BigInt64Array',
		'BigUint64Array',
		'Float32Array',
		'Float64Array',
		'Int16Array',
		'Int32Array',
		'Int8Array',
		'Uint16Array',
		'Uint32Array',
		'Uint8Array',
		'Uint8ClampedArray'
	], function (typedArray) {
		return typeof global[typedArray] === 'function';
	});
};

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"array-filter":15}],21:[function(require,module,exports){
'use strict'

exports.byteLength = byteLength
exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
for (var i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i]
  revLookup[code.charCodeAt(i)] = i
}

// Support decoding URL-safe base64 strings, as Node.js does.
// See: https://en.wikipedia.org/wiki/Base64#URL_applications
revLookup['-'.charCodeAt(0)] = 62
revLookup['_'.charCodeAt(0)] = 63

function getLens (b64) {
  var len = b64.length

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // Trim off extra bytes after placeholder bytes are found
  // See: https://github.com/beatgammit/base64-js/issues/42
  var validLen = b64.indexOf('=')
  if (validLen === -1) validLen = len

  var placeHoldersLen = validLen === len
    ? 0
    : 4 - (validLen % 4)

  return [validLen, placeHoldersLen]
}

// base64 is 4/3 + up to two characters of the original data
function byteLength (b64) {
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function _byteLength (b64, validLen, placeHoldersLen) {
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function toByteArray (b64) {
  var tmp
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]

  var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen))

  var curByte = 0

  // if there are placeholders, only get up to the last complete 4 chars
  var len = placeHoldersLen > 0
    ? validLen - 4
    : validLen

  var i
  for (i = 0; i < len; i += 4) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 18) |
      (revLookup[b64.charCodeAt(i + 1)] << 12) |
      (revLookup[b64.charCodeAt(i + 2)] << 6) |
      revLookup[b64.charCodeAt(i + 3)]
    arr[curByte++] = (tmp >> 16) & 0xFF
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 2) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 2) |
      (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 1) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 10) |
      (revLookup[b64.charCodeAt(i + 1)] << 4) |
      (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] +
    lookup[num >> 12 & 0x3F] +
    lookup[num >> 6 & 0x3F] +
    lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp =
      ((uint8[i] << 16) & 0xFF0000) +
      ((uint8[i + 1] << 8) & 0xFF00) +
      (uint8[i + 2] & 0xFF)
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    parts.push(
      lookup[tmp >> 2] +
      lookup[(tmp << 4) & 0x3F] +
      '=='
    )
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + uint8[len - 1]
    parts.push(
      lookup[tmp >> 10] +
      lookup[(tmp >> 4) & 0x3F] +
      lookup[(tmp << 2) & 0x3F] +
      '='
    )
  }

  return parts.join('')
}

},{}],22:[function(require,module,exports){

},{}],23:[function(require,module,exports){
(function (process,Buffer){(function (){
'use strict';
/* eslint camelcase: "off" */

var assert = require('assert');

var Zstream = require('pako/lib/zlib/zstream');
var zlib_deflate = require('pako/lib/zlib/deflate.js');
var zlib_inflate = require('pako/lib/zlib/inflate.js');
var constants = require('pako/lib/zlib/constants');

for (var key in constants) {
  exports[key] = constants[key];
}

// zlib modes
exports.NONE = 0;
exports.DEFLATE = 1;
exports.INFLATE = 2;
exports.GZIP = 3;
exports.GUNZIP = 4;
exports.DEFLATERAW = 5;
exports.INFLATERAW = 6;
exports.UNZIP = 7;

var GZIP_HEADER_ID1 = 0x1f;
var GZIP_HEADER_ID2 = 0x8b;

/**
 * Emulate Node's zlib C++ layer for use by the JS layer in index.js
 */
function Zlib(mode) {
  if (typeof mode !== 'number' || mode < exports.DEFLATE || mode > exports.UNZIP) {
    throw new TypeError('Bad argument');
  }

  this.dictionary = null;
  this.err = 0;
  this.flush = 0;
  this.init_done = false;
  this.level = 0;
  this.memLevel = 0;
  this.mode = mode;
  this.strategy = 0;
  this.windowBits = 0;
  this.write_in_progress = false;
  this.pending_close = false;
  this.gzip_id_bytes_read = 0;
}

Zlib.prototype.close = function () {
  if (this.write_in_progress) {
    this.pending_close = true;
    return;
  }

  this.pending_close = false;

  assert(this.init_done, 'close before init');
  assert(this.mode <= exports.UNZIP);

  if (this.mode === exports.DEFLATE || this.mode === exports.GZIP || this.mode === exports.DEFLATERAW) {
    zlib_deflate.deflateEnd(this.strm);
  } else if (this.mode === exports.INFLATE || this.mode === exports.GUNZIP || this.mode === exports.INFLATERAW || this.mode === exports.UNZIP) {
    zlib_inflate.inflateEnd(this.strm);
  }

  this.mode = exports.NONE;

  this.dictionary = null;
};

Zlib.prototype.write = function (flush, input, in_off, in_len, out, out_off, out_len) {
  return this._write(true, flush, input, in_off, in_len, out, out_off, out_len);
};

Zlib.prototype.writeSync = function (flush, input, in_off, in_len, out, out_off, out_len) {
  return this._write(false, flush, input, in_off, in_len, out, out_off, out_len);
};

Zlib.prototype._write = function (async, flush, input, in_off, in_len, out, out_off, out_len) {
  assert.equal(arguments.length, 8);

  assert(this.init_done, 'write before init');
  assert(this.mode !== exports.NONE, 'already finalized');
  assert.equal(false, this.write_in_progress, 'write already in progress');
  assert.equal(false, this.pending_close, 'close is pending');

  this.write_in_progress = true;

  assert.equal(false, flush === undefined, 'must provide flush value');

  this.write_in_progress = true;

  if (flush !== exports.Z_NO_FLUSH && flush !== exports.Z_PARTIAL_FLUSH && flush !== exports.Z_SYNC_FLUSH && flush !== exports.Z_FULL_FLUSH && flush !== exports.Z_FINISH && flush !== exports.Z_BLOCK) {
    throw new Error('Invalid flush value');
  }

  if (input == null) {
    input = Buffer.alloc(0);
    in_len = 0;
    in_off = 0;
  }

  this.strm.avail_in = in_len;
  this.strm.input = input;
  this.strm.next_in = in_off;
  this.strm.avail_out = out_len;
  this.strm.output = out;
  this.strm.next_out = out_off;
  this.flush = flush;

  if (!async) {
    // sync version
    this._process();

    if (this._checkError()) {
      return this._afterSync();
    }
    return;
  }

  // async version
  var self = this;
  process.nextTick(function () {
    self._process();
    self._after();
  });

  return this;
};

Zlib.prototype._afterSync = function () {
  var avail_out = this.strm.avail_out;
  var avail_in = this.strm.avail_in;

  this.write_in_progress = false;

  return [avail_in, avail_out];
};

Zlib.prototype._process = function () {
  var next_expected_header_byte = null;

  // If the avail_out is left at 0, then it means that it ran out
  // of room.  If there was avail_out left over, then it means
  // that all of the input was consumed.
  switch (this.mode) {
    case exports.DEFLATE:
    case exports.GZIP:
    case exports.DEFLATERAW:
      this.err = zlib_deflate.deflate(this.strm, this.flush);
      break;
    case exports.UNZIP:
      if (this.strm.avail_in > 0) {
        next_expected_header_byte = this.strm.next_in;
      }

      switch (this.gzip_id_bytes_read) {
        case 0:
          if (next_expected_header_byte === null) {
            break;
          }

          if (this.strm.input[next_expected_header_byte] === GZIP_HEADER_ID1) {
            this.gzip_id_bytes_read = 1;
            next_expected_header_byte++;

            if (this.strm.avail_in === 1) {
              // The only available byte was already read.
              break;
            }
          } else {
            this.mode = exports.INFLATE;
            break;
          }

        // fallthrough
        case 1:
          if (next_expected_header_byte === null) {
            break;
          }

          if (this.strm.input[next_expected_header_byte] === GZIP_HEADER_ID2) {
            this.gzip_id_bytes_read = 2;
            this.mode = exports.GUNZIP;
          } else {
            // There is no actual difference between INFLATE and INFLATERAW
            // (after initialization).
            this.mode = exports.INFLATE;
          }

          break;
        default:
          throw new Error('invalid number of gzip magic number bytes read');
      }

    // fallthrough
    case exports.INFLATE:
    case exports.GUNZIP:
    case exports.INFLATERAW:
      this.err = zlib_inflate.inflate(this.strm, this.flush

      // If data was encoded with dictionary
      );if (this.err === exports.Z_NEED_DICT && this.dictionary) {
        // Load it
        this.err = zlib_inflate.inflateSetDictionary(this.strm, this.dictionary);
        if (this.err === exports.Z_OK) {
          // And try to decode again
          this.err = zlib_inflate.inflate(this.strm, this.flush);
        } else if (this.err === exports.Z_DATA_ERROR) {
          // Both inflateSetDictionary() and inflate() return Z_DATA_ERROR.
          // Make it possible for After() to tell a bad dictionary from bad
          // input.
          this.err = exports.Z_NEED_DICT;
        }
      }
      while (this.strm.avail_in > 0 && this.mode === exports.GUNZIP && this.err === exports.Z_STREAM_END && this.strm.next_in[0] !== 0x00) {
        // Bytes remain in input buffer. Perhaps this is another compressed
        // member in the same archive, or just trailing garbage.
        // Trailing zero bytes are okay, though, since they are frequently
        // used for padding.

        this.reset();
        this.err = zlib_inflate.inflate(this.strm, this.flush);
      }
      break;
    default:
      throw new Error('Unknown mode ' + this.mode);
  }
};

Zlib.prototype._checkError = function () {
  // Acceptable error states depend on the type of zlib stream.
  switch (this.err) {
    case exports.Z_OK:
    case exports.Z_BUF_ERROR:
      if (this.strm.avail_out !== 0 && this.flush === exports.Z_FINISH) {
        this._error('unexpected end of file');
        return false;
      }
      break;
    case exports.Z_STREAM_END:
      // normal statuses, not fatal
      break;
    case exports.Z_NEED_DICT:
      if (this.dictionary == null) {
        this._error('Missing dictionary');
      } else {
        this._error('Bad dictionary');
      }
      return false;
    default:
      // something else.
      this._error('Zlib error');
      return false;
  }

  return true;
};

Zlib.prototype._after = function () {
  if (!this._checkError()) {
    return;
  }

  var avail_out = this.strm.avail_out;
  var avail_in = this.strm.avail_in;

  this.write_in_progress = false;

  // call the write() cb
  this.callback(avail_in, avail_out);

  if (this.pending_close) {
    this.close();
  }
};

Zlib.prototype._error = function (message) {
  if (this.strm.msg) {
    message = this.strm.msg;
  }
  this.onerror(message, this.err

  // no hope of rescue.
  );this.write_in_progress = false;
  if (this.pending_close) {
    this.close();
  }
};

Zlib.prototype.init = function (windowBits, level, memLevel, strategy, dictionary) {
  assert(arguments.length === 4 || arguments.length === 5, 'init(windowBits, level, memLevel, strategy, [dictionary])');

  assert(windowBits >= 8 && windowBits <= 15, 'invalid windowBits');
  assert(level >= -1 && level <= 9, 'invalid compression level');

  assert(memLevel >= 1 && memLevel <= 9, 'invalid memlevel');

  assert(strategy === exports.Z_FILTERED || strategy === exports.Z_HUFFMAN_ONLY || strategy === exports.Z_RLE || strategy === exports.Z_FIXED || strategy === exports.Z_DEFAULT_STRATEGY, 'invalid strategy');

  this._init(level, windowBits, memLevel, strategy, dictionary);
  this._setDictionary();
};

Zlib.prototype.params = function () {
  throw new Error('deflateParams Not supported');
};

Zlib.prototype.reset = function () {
  this._reset();
  this._setDictionary();
};

Zlib.prototype._init = function (level, windowBits, memLevel, strategy, dictionary) {
  this.level = level;
  this.windowBits = windowBits;
  this.memLevel = memLevel;
  this.strategy = strategy;

  this.flush = exports.Z_NO_FLUSH;

  this.err = exports.Z_OK;

  if (this.mode === exports.GZIP || this.mode === exports.GUNZIP) {
    this.windowBits += 16;
  }

  if (this.mode === exports.UNZIP) {
    this.windowBits += 32;
  }

  if (this.mode === exports.DEFLATERAW || this.mode === exports.INFLATERAW) {
    this.windowBits = -1 * this.windowBits;
  }

  this.strm = new Zstream();

  switch (this.mode) {
    case exports.DEFLATE:
    case exports.GZIP:
    case exports.DEFLATERAW:
      this.err = zlib_deflate.deflateInit2(this.strm, this.level, exports.Z_DEFLATED, this.windowBits, this.memLevel, this.strategy);
      break;
    case exports.INFLATE:
    case exports.GUNZIP:
    case exports.INFLATERAW:
    case exports.UNZIP:
      this.err = zlib_inflate.inflateInit2(this.strm, this.windowBits);
      break;
    default:
      throw new Error('Unknown mode ' + this.mode);
  }

  if (this.err !== exports.Z_OK) {
    this._error('Init error');
  }

  this.dictionary = dictionary;

  this.write_in_progress = false;
  this.init_done = true;
};

Zlib.prototype._setDictionary = function () {
  if (this.dictionary == null) {
    return;
  }

  this.err = exports.Z_OK;

  switch (this.mode) {
    case exports.DEFLATE:
    case exports.DEFLATERAW:
      this.err = zlib_deflate.deflateSetDictionary(this.strm, this.dictionary);
      break;
    default:
      break;
  }

  if (this.err !== exports.Z_OK) {
    this._error('Failed to set dictionary');
  }
};

Zlib.prototype._reset = function () {
  this.err = exports.Z_OK;

  switch (this.mode) {
    case exports.DEFLATE:
    case exports.DEFLATERAW:
    case exports.GZIP:
      this.err = zlib_deflate.deflateReset(this.strm);
      break;
    case exports.INFLATE:
    case exports.INFLATERAW:
    case exports.GUNZIP:
      this.err = zlib_inflate.inflateReset(this.strm);
      break;
    default:
      break;
  }

  if (this.err !== exports.Z_OK) {
    this._error('Failed to reset stream');
  }
};

exports.Zlib = Zlib;
}).call(this)}).call(this,require('_process'),require("buffer").Buffer)
},{"_process":54,"assert":16,"buffer":36,"pako/lib/zlib/constants":27,"pako/lib/zlib/deflate.js":29,"pako/lib/zlib/inflate.js":31,"pako/lib/zlib/zstream":35}],24:[function(require,module,exports){
(function (process){(function (){
'use strict';

var Buffer = require('buffer').Buffer;
var Transform = require('stream').Transform;
var binding = require('./binding');
var util = require('util');
var assert = require('assert').ok;
var kMaxLength = require('buffer').kMaxLength;
var kRangeErrorMessage = 'Cannot create final Buffer. It would be larger ' + 'than 0x' + kMaxLength.toString(16) + ' bytes';

// zlib doesn't provide these, so kludge them in following the same
// const naming scheme zlib uses.
binding.Z_MIN_WINDOWBITS = 8;
binding.Z_MAX_WINDOWBITS = 15;
binding.Z_DEFAULT_WINDOWBITS = 15;

// fewer than 64 bytes per chunk is stupid.
// technically it could work with as few as 8, but even 64 bytes
// is absurdly low.  Usually a MB or more is best.
binding.Z_MIN_CHUNK = 64;
binding.Z_MAX_CHUNK = Infinity;
binding.Z_DEFAULT_CHUNK = 16 * 1024;

binding.Z_MIN_MEMLEVEL = 1;
binding.Z_MAX_MEMLEVEL = 9;
binding.Z_DEFAULT_MEMLEVEL = 8;

binding.Z_MIN_LEVEL = -1;
binding.Z_MAX_LEVEL = 9;
binding.Z_DEFAULT_LEVEL = binding.Z_DEFAULT_COMPRESSION;

// expose all the zlib constants
var bkeys = Object.keys(binding);
for (var bk = 0; bk < bkeys.length; bk++) {
  var bkey = bkeys[bk];
  if (bkey.match(/^Z/)) {
    Object.defineProperty(exports, bkey, {
      enumerable: true, value: binding[bkey], writable: false
    });
  }
}

// translation table for return codes.
var codes = {
  Z_OK: binding.Z_OK,
  Z_STREAM_END: binding.Z_STREAM_END,
  Z_NEED_DICT: binding.Z_NEED_DICT,
  Z_ERRNO: binding.Z_ERRNO,
  Z_STREAM_ERROR: binding.Z_STREAM_ERROR,
  Z_DATA_ERROR: binding.Z_DATA_ERROR,
  Z_MEM_ERROR: binding.Z_MEM_ERROR,
  Z_BUF_ERROR: binding.Z_BUF_ERROR,
  Z_VERSION_ERROR: binding.Z_VERSION_ERROR
};

var ckeys = Object.keys(codes);
for (var ck = 0; ck < ckeys.length; ck++) {
  var ckey = ckeys[ck];
  codes[codes[ckey]] = ckey;
}

Object.defineProperty(exports, 'codes', {
  enumerable: true, value: Object.freeze(codes), writable: false
});

exports.Deflate = Deflate;
exports.Inflate = Inflate;
exports.Gzip = Gzip;
exports.Gunzip = Gunzip;
exports.DeflateRaw = DeflateRaw;
exports.InflateRaw = InflateRaw;
exports.Unzip = Unzip;

exports.createDeflate = function (o) {
  return new Deflate(o);
};

exports.createInflate = function (o) {
  return new Inflate(o);
};

exports.createDeflateRaw = function (o) {
  return new DeflateRaw(o);
};

exports.createInflateRaw = function (o) {
  return new InflateRaw(o);
};

exports.createGzip = function (o) {
  return new Gzip(o);
};

exports.createGunzip = function (o) {
  return new Gunzip(o);
};

exports.createUnzip = function (o) {
  return new Unzip(o);
};

// Convenience methods.
// compress/decompress a string or buffer in one step.
exports.deflate = function (buffer, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  return zlibBuffer(new Deflate(opts), buffer, callback);
};

exports.deflateSync = function (buffer, opts) {
  return zlibBufferSync(new Deflate(opts), buffer);
};

exports.gzip = function (buffer, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  return zlibBuffer(new Gzip(opts), buffer, callback);
};

exports.gzipSync = function (buffer, opts) {
  return zlibBufferSync(new Gzip(opts), buffer);
};

exports.deflateRaw = function (buffer, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  return zlibBuffer(new DeflateRaw(opts), buffer, callback);
};

exports.deflateRawSync = function (buffer, opts) {
  return zlibBufferSync(new DeflateRaw(opts), buffer);
};

exports.unzip = function (buffer, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  return zlibBuffer(new Unzip(opts), buffer, callback);
};

exports.unzipSync = function (buffer, opts) {
  return zlibBufferSync(new Unzip(opts), buffer);
};

exports.inflate = function (buffer, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  return zlibBuffer(new Inflate(opts), buffer, callback);
};

exports.inflateSync = function (buffer, opts) {
  return zlibBufferSync(new Inflate(opts), buffer);
};

exports.gunzip = function (buffer, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  return zlibBuffer(new Gunzip(opts), buffer, callback);
};

exports.gunzipSync = function (buffer, opts) {
  return zlibBufferSync(new Gunzip(opts), buffer);
};

exports.inflateRaw = function (buffer, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  return zlibBuffer(new InflateRaw(opts), buffer, callback);
};

exports.inflateRawSync = function (buffer, opts) {
  return zlibBufferSync(new InflateRaw(opts), buffer);
};

function zlibBuffer(engine, buffer, callback) {
  var buffers = [];
  var nread = 0;

  engine.on('error', onError);
  engine.on('end', onEnd);

  engine.end(buffer);
  flow();

  function flow() {
    var chunk;
    while (null !== (chunk = engine.read())) {
      buffers.push(chunk);
      nread += chunk.length;
    }
    engine.once('readable', flow);
  }

  function onError(err) {
    engine.removeListener('end', onEnd);
    engine.removeListener('readable', flow);
    callback(err);
  }

  function onEnd() {
    var buf;
    var err = null;

    if (nread >= kMaxLength) {
      err = new RangeError(kRangeErrorMessage);
    } else {
      buf = Buffer.concat(buffers, nread);
    }

    buffers = [];
    engine.close();
    callback(err, buf);
  }
}

function zlibBufferSync(engine, buffer) {
  if (typeof buffer === 'string') buffer = Buffer.from(buffer);

  if (!Buffer.isBuffer(buffer)) throw new TypeError('Not a string or buffer');

  var flushFlag = engine._finishFlushFlag;

  return engine._processChunk(buffer, flushFlag);
}

// generic zlib
// minimal 2-byte header
function Deflate(opts) {
  if (!(this instanceof Deflate)) return new Deflate(opts);
  Zlib.call(this, opts, binding.DEFLATE);
}

function Inflate(opts) {
  if (!(this instanceof Inflate)) return new Inflate(opts);
  Zlib.call(this, opts, binding.INFLATE);
}

// gzip - bigger header, same deflate compression
function Gzip(opts) {
  if (!(this instanceof Gzip)) return new Gzip(opts);
  Zlib.call(this, opts, binding.GZIP);
}

function Gunzip(opts) {
  if (!(this instanceof Gunzip)) return new Gunzip(opts);
  Zlib.call(this, opts, binding.GUNZIP);
}

// raw - no header
function DeflateRaw(opts) {
  if (!(this instanceof DeflateRaw)) return new DeflateRaw(opts);
  Zlib.call(this, opts, binding.DEFLATERAW);
}

function InflateRaw(opts) {
  if (!(this instanceof InflateRaw)) return new InflateRaw(opts);
  Zlib.call(this, opts, binding.INFLATERAW);
}

// auto-detect header.
function Unzip(opts) {
  if (!(this instanceof Unzip)) return new Unzip(opts);
  Zlib.call(this, opts, binding.UNZIP);
}

function isValidFlushFlag(flag) {
  return flag === binding.Z_NO_FLUSH || flag === binding.Z_PARTIAL_FLUSH || flag === binding.Z_SYNC_FLUSH || flag === binding.Z_FULL_FLUSH || flag === binding.Z_FINISH || flag === binding.Z_BLOCK;
}

// the Zlib class they all inherit from
// This thing manages the queue of requests, and returns
// true or false if there is anything in the queue when
// you call the .write() method.

function Zlib(opts, mode) {
  var _this = this;

  this._opts = opts = opts || {};
  this._chunkSize = opts.chunkSize || exports.Z_DEFAULT_CHUNK;

  Transform.call(this, opts);

  if (opts.flush && !isValidFlushFlag(opts.flush)) {
    throw new Error('Invalid flush flag: ' + opts.flush);
  }
  if (opts.finishFlush && !isValidFlushFlag(opts.finishFlush)) {
    throw new Error('Invalid flush flag: ' + opts.finishFlush);
  }

  this._flushFlag = opts.flush || binding.Z_NO_FLUSH;
  this._finishFlushFlag = typeof opts.finishFlush !== 'undefined' ? opts.finishFlush : binding.Z_FINISH;

  if (opts.chunkSize) {
    if (opts.chunkSize < exports.Z_MIN_CHUNK || opts.chunkSize > exports.Z_MAX_CHUNK) {
      throw new Error('Invalid chunk size: ' + opts.chunkSize);
    }
  }

  if (opts.windowBits) {
    if (opts.windowBits < exports.Z_MIN_WINDOWBITS || opts.windowBits > exports.Z_MAX_WINDOWBITS) {
      throw new Error('Invalid windowBits: ' + opts.windowBits);
    }
  }

  if (opts.level) {
    if (opts.level < exports.Z_MIN_LEVEL || opts.level > exports.Z_MAX_LEVEL) {
      throw new Error('Invalid compression level: ' + opts.level);
    }
  }

  if (opts.memLevel) {
    if (opts.memLevel < exports.Z_MIN_MEMLEVEL || opts.memLevel > exports.Z_MAX_MEMLEVEL) {
      throw new Error('Invalid memLevel: ' + opts.memLevel);
    }
  }

  if (opts.strategy) {
    if (opts.strategy != exports.Z_FILTERED && opts.strategy != exports.Z_HUFFMAN_ONLY && opts.strategy != exports.Z_RLE && opts.strategy != exports.Z_FIXED && opts.strategy != exports.Z_DEFAULT_STRATEGY) {
      throw new Error('Invalid strategy: ' + opts.strategy);
    }
  }

  if (opts.dictionary) {
    if (!Buffer.isBuffer(opts.dictionary)) {
      throw new Error('Invalid dictionary: it should be a Buffer instance');
    }
  }

  this._handle = new binding.Zlib(mode);

  var self = this;
  this._hadError = false;
  this._handle.onerror = function (message, errno) {
    // there is no way to cleanly recover.
    // continuing only obscures problems.
    _close(self);
    self._hadError = true;

    var error = new Error(message);
    error.errno = errno;
    error.code = exports.codes[errno];
    self.emit('error', error);
  };

  var level = exports.Z_DEFAULT_COMPRESSION;
  if (typeof opts.level === 'number') level = opts.level;

  var strategy = exports.Z_DEFAULT_STRATEGY;
  if (typeof opts.strategy === 'number') strategy = opts.strategy;

  this._handle.init(opts.windowBits || exports.Z_DEFAULT_WINDOWBITS, level, opts.memLevel || exports.Z_DEFAULT_MEMLEVEL, strategy, opts.dictionary);

  this._buffer = Buffer.allocUnsafe(this._chunkSize);
  this._offset = 0;
  this._level = level;
  this._strategy = strategy;

  this.once('end', this.close);

  Object.defineProperty(this, '_closed', {
    get: function () {
      return !_this._handle;
    },
    configurable: true,
    enumerable: true
  });
}

util.inherits(Zlib, Transform);

Zlib.prototype.params = function (level, strategy, callback) {
  if (level < exports.Z_MIN_LEVEL || level > exports.Z_MAX_LEVEL) {
    throw new RangeError('Invalid compression level: ' + level);
  }
  if (strategy != exports.Z_FILTERED && strategy != exports.Z_HUFFMAN_ONLY && strategy != exports.Z_RLE && strategy != exports.Z_FIXED && strategy != exports.Z_DEFAULT_STRATEGY) {
    throw new TypeError('Invalid strategy: ' + strategy);
  }

  if (this._level !== level || this._strategy !== strategy) {
    var self = this;
    this.flush(binding.Z_SYNC_FLUSH, function () {
      assert(self._handle, 'zlib binding closed');
      self._handle.params(level, strategy);
      if (!self._hadError) {
        self._level = level;
        self._strategy = strategy;
        if (callback) callback();
      }
    });
  } else {
    process.nextTick(callback);
  }
};

Zlib.prototype.reset = function () {
  assert(this._handle, 'zlib binding closed');
  return this._handle.reset();
};

// This is the _flush function called by the transform class,
// internally, when the last chunk has been written.
Zlib.prototype._flush = function (callback) {
  this._transform(Buffer.alloc(0), '', callback);
};

Zlib.prototype.flush = function (kind, callback) {
  var _this2 = this;

  var ws = this._writableState;

  if (typeof kind === 'function' || kind === undefined && !callback) {
    callback = kind;
    kind = binding.Z_FULL_FLUSH;
  }

  if (ws.ended) {
    if (callback) process.nextTick(callback);
  } else if (ws.ending) {
    if (callback) this.once('end', callback);
  } else if (ws.needDrain) {
    if (callback) {
      this.once('drain', function () {
        return _this2.flush(kind, callback);
      });
    }
  } else {
    this._flushFlag = kind;
    this.write(Buffer.alloc(0), '', callback);
  }
};

Zlib.prototype.close = function (callback) {
  _close(this, callback);
  process.nextTick(emitCloseNT, this);
};

function _close(engine, callback) {
  if (callback) process.nextTick(callback);

  // Caller may invoke .close after a zlib error (which will null _handle).
  if (!engine._handle) return;

  engine._handle.close();
  engine._handle = null;
}

function emitCloseNT(self) {
  self.emit('close');
}

Zlib.prototype._transform = function (chunk, encoding, cb) {
  var flushFlag;
  var ws = this._writableState;
  var ending = ws.ending || ws.ended;
  var last = ending && (!chunk || ws.length === chunk.length);

  if (chunk !== null && !Buffer.isBuffer(chunk)) return cb(new Error('invalid input'));

  if (!this._handle) return cb(new Error('zlib binding closed'));

  // If it's the last chunk, or a final flush, we use the Z_FINISH flush flag
  // (or whatever flag was provided using opts.finishFlush).
  // If it's explicitly flushing at some other time, then we use
  // Z_FULL_FLUSH. Otherwise, use Z_NO_FLUSH for maximum compression
  // goodness.
  if (last) flushFlag = this._finishFlushFlag;else {
    flushFlag = this._flushFlag;
    // once we've flushed the last of the queue, stop flushing and
    // go back to the normal behavior.
    if (chunk.length >= ws.length) {
      this._flushFlag = this._opts.flush || binding.Z_NO_FLUSH;
    }
  }

  this._processChunk(chunk, flushFlag, cb);
};

Zlib.prototype._processChunk = function (chunk, flushFlag, cb) {
  var availInBefore = chunk && chunk.length;
  var availOutBefore = this._chunkSize - this._offset;
  var inOff = 0;

  var self = this;

  var async = typeof cb === 'function';

  if (!async) {
    var buffers = [];
    var nread = 0;

    var error;
    this.on('error', function (er) {
      error = er;
    });

    assert(this._handle, 'zlib binding closed');
    do {
      var res = this._handle.writeSync(flushFlag, chunk, // in
      inOff, // in_off
      availInBefore, // in_len
      this._buffer, // out
      this._offset, //out_off
      availOutBefore); // out_len
    } while (!this._hadError && callback(res[0], res[1]));

    if (this._hadError) {
      throw error;
    }

    if (nread >= kMaxLength) {
      _close(this);
      throw new RangeError(kRangeErrorMessage);
    }

    var buf = Buffer.concat(buffers, nread);
    _close(this);

    return buf;
  }

  assert(this._handle, 'zlib binding closed');
  var req = this._handle.write(flushFlag, chunk, // in
  inOff, // in_off
  availInBefore, // in_len
  this._buffer, // out
  this._offset, //out_off
  availOutBefore); // out_len

  req.buffer = chunk;
  req.callback = callback;

  function callback(availInAfter, availOutAfter) {
    // When the callback is used in an async write, the callback's
    // context is the `req` object that was created. The req object
    // is === this._handle, and that's why it's important to null
    // out the values after they are done being used. `this._handle`
    // can stay in memory longer than the callback and buffer are needed.
    if (this) {
      this.buffer = null;
      this.callback = null;
    }

    if (self._hadError) return;

    var have = availOutBefore - availOutAfter;
    assert(have >= 0, 'have should not go down');

    if (have > 0) {
      var out = self._buffer.slice(self._offset, self._offset + have);
      self._offset += have;
      // serve some output to the consumer.
      if (async) {
        self.push(out);
      } else {
        buffers.push(out);
        nread += out.length;
      }
    }

    // exhausted the output buffer, or used all the input create a new one.
    if (availOutAfter === 0 || self._offset >= self._chunkSize) {
      availOutBefore = self._chunkSize;
      self._offset = 0;
      self._buffer = Buffer.allocUnsafe(self._chunkSize);
    }

    if (availOutAfter === 0) {
      // Not actually done.  Need to reprocess.
      // Also, update the availInBefore to the availInAfter value,
      // so that if we have to hit it a third (fourth, etc.) time,
      // it'll have the correct byte counts.
      inOff += availInBefore - availInAfter;
      availInBefore = availInAfter;

      if (!async) return true;

      var newReq = self._handle.write(flushFlag, chunk, inOff, availInBefore, self._buffer, self._offset, self._chunkSize);
      newReq.callback = callback; // this same function
      newReq.buffer = chunk;
      return;
    }

    if (!async) return false;

    // finished with the chunk.
    cb();
  }
};

util.inherits(Deflate, Zlib);
util.inherits(Inflate, Zlib);
util.inherits(Gzip, Zlib);
util.inherits(Gunzip, Zlib);
util.inherits(DeflateRaw, Zlib);
util.inherits(InflateRaw, Zlib);
util.inherits(Unzip, Zlib);
}).call(this)}).call(this,require('_process'))
},{"./binding":23,"_process":54,"assert":16,"buffer":36,"stream":56,"util":76}],25:[function(require,module,exports){
'use strict';


var TYPED_OK =  (typeof Uint8Array !== 'undefined') &&
                (typeof Uint16Array !== 'undefined') &&
                (typeof Int32Array !== 'undefined');

function _has(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

exports.assign = function (obj /*from1, from2, from3, ...*/) {
  var sources = Array.prototype.slice.call(arguments, 1);
  while (sources.length) {
    var source = sources.shift();
    if (!source) { continue; }

    if (typeof source !== 'object') {
      throw new TypeError(source + 'must be non-object');
    }

    for (var p in source) {
      if (_has(source, p)) {
        obj[p] = source[p];
      }
    }
  }

  return obj;
};


// reduce buffer size, avoiding mem copy
exports.shrinkBuf = function (buf, size) {
  if (buf.length === size) { return buf; }
  if (buf.subarray) { return buf.subarray(0, size); }
  buf.length = size;
  return buf;
};


var fnTyped = {
  arraySet: function (dest, src, src_offs, len, dest_offs) {
    if (src.subarray && dest.subarray) {
      dest.set(src.subarray(src_offs, src_offs + len), dest_offs);
      return;
    }
    // Fallback to ordinary array
    for (var i = 0; i < len; i++) {
      dest[dest_offs + i] = src[src_offs + i];
    }
  },
  // Join array of chunks to single array.
  flattenChunks: function (chunks) {
    var i, l, len, pos, chunk, result;

    // calculate data length
    len = 0;
    for (i = 0, l = chunks.length; i < l; i++) {
      len += chunks[i].length;
    }

    // join chunks
    result = new Uint8Array(len);
    pos = 0;
    for (i = 0, l = chunks.length; i < l; i++) {
      chunk = chunks[i];
      result.set(chunk, pos);
      pos += chunk.length;
    }

    return result;
  }
};

var fnUntyped = {
  arraySet: function (dest, src, src_offs, len, dest_offs) {
    for (var i = 0; i < len; i++) {
      dest[dest_offs + i] = src[src_offs + i];
    }
  },
  // Join array of chunks to single array.
  flattenChunks: function (chunks) {
    return [].concat.apply([], chunks);
  }
};


// Enable/Disable typed arrays use, for testing
//
exports.setTyped = function (on) {
  if (on) {
    exports.Buf8  = Uint8Array;
    exports.Buf16 = Uint16Array;
    exports.Buf32 = Int32Array;
    exports.assign(exports, fnTyped);
  } else {
    exports.Buf8  = Array;
    exports.Buf16 = Array;
    exports.Buf32 = Array;
    exports.assign(exports, fnUntyped);
  }
};

exports.setTyped(TYPED_OK);

},{}],26:[function(require,module,exports){
'use strict';

// Note: adler32 takes 12% for level 0 and 2% for level 6.
// It isn't worth it to make additional optimizations as in original.
// Small size is preferable.

// (C) 1995-2013 Jean-loup Gailly and Mark Adler
// (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
//
// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.
//
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:
//
// 1. The origin of this software must not be misrepresented; you must not
//   claim that you wrote the original software. If you use this software
//   in a product, an acknowledgment in the product documentation would be
//   appreciated but is not required.
// 2. Altered source versions must be plainly marked as such, and must not be
//   misrepresented as being the original software.
// 3. This notice may not be removed or altered from any source distribution.

function adler32(adler, buf, len, pos) {
  var s1 = (adler & 0xffff) |0,
      s2 = ((adler >>> 16) & 0xffff) |0,
      n = 0;

  while (len !== 0) {
    // Set limit ~ twice less than 5552, to keep
    // s2 in 31-bits, because we force signed ints.
    // in other case %= will fail.
    n = len > 2000 ? 2000 : len;
    len -= n;

    do {
      s1 = (s1 + buf[pos++]) |0;
      s2 = (s2 + s1) |0;
    } while (--n);

    s1 %= 65521;
    s2 %= 65521;
  }

  return (s1 | (s2 << 16)) |0;
}


module.exports = adler32;

},{}],27:[function(require,module,exports){
'use strict';

// (C) 1995-2013 Jean-loup Gailly and Mark Adler
// (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
//
// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.
//
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:
//
// 1. The origin of this software must not be misrepresented; you must not
//   claim that you wrote the original software. If you use this software
//   in a product, an acknowledgment in the product documentation would be
//   appreciated but is not required.
// 2. Altered source versions must be plainly marked as such, and must not be
//   misrepresented as being the original software.
// 3. This notice may not be removed or altered from any source distribution.

module.exports = {

  /* Allowed flush values; see deflate() and inflate() below for details */
  Z_NO_FLUSH:         0,
  Z_PARTIAL_FLUSH:    1,
  Z_SYNC_FLUSH:       2,
  Z_FULL_FLUSH:       3,
  Z_FINISH:           4,
  Z_BLOCK:            5,
  Z_TREES:            6,

  /* Return codes for the compression/decompression functions. Negative values
  * are errors, positive values are used for special but normal events.
  */
  Z_OK:               0,
  Z_STREAM_END:       1,
  Z_NEED_DICT:        2,
  Z_ERRNO:           -1,
  Z_STREAM_ERROR:    -2,
  Z_DATA_ERROR:      -3,
  //Z_MEM_ERROR:     -4,
  Z_BUF_ERROR:       -5,
  //Z_VERSION_ERROR: -6,

  /* compression levels */
  Z_NO_COMPRESSION:         0,
  Z_BEST_SPEED:             1,
  Z_BEST_COMPRESSION:       9,
  Z_DEFAULT_COMPRESSION:   -1,


  Z_FILTERED:               1,
  Z_HUFFMAN_ONLY:           2,
  Z_RLE:                    3,
  Z_FIXED:                  4,
  Z_DEFAULT_STRATEGY:       0,

  /* Possible values of the data_type field (though see inflate()) */
  Z_BINARY:                 0,
  Z_TEXT:                   1,
  //Z_ASCII:                1, // = Z_TEXT (deprecated)
  Z_UNKNOWN:                2,

  /* The deflate compression method */
  Z_DEFLATED:               8
  //Z_NULL:                 null // Use -1 or null inline, depending on var type
};

},{}],28:[function(require,module,exports){
'use strict';

// Note: we can't get significant speed boost here.
// So write code to minimize size - no pregenerated tables
// and array tools dependencies.

// (C) 1995-2013 Jean-loup Gailly and Mark Adler
// (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
//
// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.
//
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:
//
// 1. The origin of this software must not be misrepresented; you must not
//   claim that you wrote the original software. If you use this software
//   in a product, an acknowledgment in the product documentation would be
//   appreciated but is not required.
// 2. Altered source versions must be plainly marked as such, and must not be
//   misrepresented as being the original software.
// 3. This notice may not be removed or altered from any source distribution.

// Use ordinary array, since untyped makes no boost here
function makeTable() {
  var c, table = [];

  for (var n = 0; n < 256; n++) {
    c = n;
    for (var k = 0; k < 8; k++) {
      c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    table[n] = c;
  }

  return table;
}

// Create table on load. Just 255 signed longs. Not a problem.
var crcTable = makeTable();


function crc32(crc, buf, len, pos) {
  var t = crcTable,
      end = pos + len;

  crc ^= -1;

  for (var i = pos; i < end; i++) {
    crc = (crc >>> 8) ^ t[(crc ^ buf[i]) & 0xFF];
  }

  return (crc ^ (-1)); // >>> 0;
}


module.exports = crc32;

},{}],29:[function(require,module,exports){
'use strict';

// (C) 1995-2013 Jean-loup Gailly and Mark Adler
// (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
//
// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.
//
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:
//
// 1. The origin of this software must not be misrepresented; you must not
//   claim that you wrote the original software. If you use this software
//   in a product, an acknowledgment in the product documentation would be
//   appreciated but is not required.
// 2. Altered source versions must be plainly marked as such, and must not be
//   misrepresented as being the original software.
// 3. This notice may not be removed or altered from any source distribution.

var utils   = require('../utils/common');
var trees   = require('./trees');
var adler32 = require('./adler32');
var crc32   = require('./crc32');
var msg     = require('./messages');

/* Public constants ==========================================================*/
/* ===========================================================================*/


/* Allowed flush values; see deflate() and inflate() below for details */
var Z_NO_FLUSH      = 0;
var Z_PARTIAL_FLUSH = 1;
//var Z_SYNC_FLUSH    = 2;
var Z_FULL_FLUSH    = 3;
var Z_FINISH        = 4;
var Z_BLOCK         = 5;
//var Z_TREES         = 6;


/* Return codes for the compression/decompression functions. Negative values
 * are errors, positive values are used for special but normal events.
 */
var Z_OK            = 0;
var Z_STREAM_END    = 1;
//var Z_NEED_DICT     = 2;
//var Z_ERRNO         = -1;
var Z_STREAM_ERROR  = -2;
var Z_DATA_ERROR    = -3;
//var Z_MEM_ERROR     = -4;
var Z_BUF_ERROR     = -5;
//var Z_VERSION_ERROR = -6;


/* compression levels */
//var Z_NO_COMPRESSION      = 0;
//var Z_BEST_SPEED          = 1;
//var Z_BEST_COMPRESSION    = 9;
var Z_DEFAULT_COMPRESSION = -1;


var Z_FILTERED            = 1;
var Z_HUFFMAN_ONLY        = 2;
var Z_RLE                 = 3;
var Z_FIXED               = 4;
var Z_DEFAULT_STRATEGY    = 0;

/* Possible values of the data_type field (though see inflate()) */
//var Z_BINARY              = 0;
//var Z_TEXT                = 1;
//var Z_ASCII               = 1; // = Z_TEXT
var Z_UNKNOWN             = 2;


/* The deflate compression method */
var Z_DEFLATED  = 8;

/*============================================================================*/


var MAX_MEM_LEVEL = 9;
/* Maximum value for memLevel in deflateInit2 */
var MAX_WBITS = 15;
/* 32K LZ77 window */
var DEF_MEM_LEVEL = 8;


var LENGTH_CODES  = 29;
/* number of length codes, not counting the special END_BLOCK code */
var LITERALS      = 256;
/* number of literal bytes 0..255 */
var L_CODES       = LITERALS + 1 + LENGTH_CODES;
/* number of Literal or Length codes, including the END_BLOCK code */
var D_CODES       = 30;
/* number of distance codes */
var BL_CODES      = 19;
/* number of codes used to transfer the bit lengths */
var HEAP_SIZE     = 2 * L_CODES + 1;
/* maximum heap size */
var MAX_BITS  = 15;
/* All codes must not exceed MAX_BITS bits */

var MIN_MATCH = 3;
var MAX_MATCH = 258;
var MIN_LOOKAHEAD = (MAX_MATCH + MIN_MATCH + 1);

var PRESET_DICT = 0x20;

var INIT_STATE = 42;
var EXTRA_STATE = 69;
var NAME_STATE = 73;
var COMMENT_STATE = 91;
var HCRC_STATE = 103;
var BUSY_STATE = 113;
var FINISH_STATE = 666;

var BS_NEED_MORE      = 1; /* block not completed, need more input or more output */
var BS_BLOCK_DONE     = 2; /* block flush performed */
var BS_FINISH_STARTED = 3; /* finish started, need only more output at next deflate */
var BS_FINISH_DONE    = 4; /* finish done, accept no more input or output */

var OS_CODE = 0x03; // Unix :) . Don't detect, use this default.

function err(strm, errorCode) {
  strm.msg = msg[errorCode];
  return errorCode;
}

function rank(f) {
  return ((f) << 1) - ((f) > 4 ? 9 : 0);
}

function zero(buf) { var len = buf.length; while (--len >= 0) { buf[len] = 0; } }


/* =========================================================================
 * Flush as much pending output as possible. All deflate() output goes
 * through this function so some applications may wish to modify it
 * to avoid allocating a large strm->output buffer and copying into it.
 * (See also read_buf()).
 */
function flush_pending(strm) {
  var s = strm.state;

  //_tr_flush_bits(s);
  var len = s.pending;
  if (len > strm.avail_out) {
    len = strm.avail_out;
  }
  if (len === 0) { return; }

  utils.arraySet(strm.output, s.pending_buf, s.pending_out, len, strm.next_out);
  strm.next_out += len;
  s.pending_out += len;
  strm.total_out += len;
  strm.avail_out -= len;
  s.pending -= len;
  if (s.pending === 0) {
    s.pending_out = 0;
  }
}


function flush_block_only(s, last) {
  trees._tr_flush_block(s, (s.block_start >= 0 ? s.block_start : -1), s.strstart - s.block_start, last);
  s.block_start = s.strstart;
  flush_pending(s.strm);
}


function put_byte(s, b) {
  s.pending_buf[s.pending++] = b;
}


/* =========================================================================
 * Put a short in the pending buffer. The 16-bit value is put in MSB order.
 * IN assertion: the stream state is correct and there is enough room in
 * pending_buf.
 */
function putShortMSB(s, b) {
//  put_byte(s, (Byte)(b >> 8));
//  put_byte(s, (Byte)(b & 0xff));
  s.pending_buf[s.pending++] = (b >>> 8) & 0xff;
  s.pending_buf[s.pending++] = b & 0xff;
}


/* ===========================================================================
 * Read a new buffer from the current input stream, update the adler32
 * and total number of bytes read.  All deflate() input goes through
 * this function so some applications may wish to modify it to avoid
 * allocating a large strm->input buffer and copying from it.
 * (See also flush_pending()).
 */
function read_buf(strm, buf, start, size) {
  var len = strm.avail_in;

  if (len > size) { len = size; }
  if (len === 0) { return 0; }

  strm.avail_in -= len;

  // zmemcpy(buf, strm->next_in, len);
  utils.arraySet(buf, strm.input, strm.next_in, len, start);
  if (strm.state.wrap === 1) {
    strm.adler = adler32(strm.adler, buf, len, start);
  }

  else if (strm.state.wrap === 2) {
    strm.adler = crc32(strm.adler, buf, len, start);
  }

  strm.next_in += len;
  strm.total_in += len;

  return len;
}


/* ===========================================================================
 * Set match_start to the longest match starting at the given string and
 * return its length. Matches shorter or equal to prev_length are discarded,
 * in which case the result is equal to prev_length and match_start is
 * garbage.
 * IN assertions: cur_match is the head of the hash chain for the current
 *   string (strstart) and its distance is <= MAX_DIST, and prev_length >= 1
 * OUT assertion: the match length is not greater than s->lookahead.
 */
function longest_match(s, cur_match) {
  var chain_length = s.max_chain_length;      /* max hash chain length */
  var scan = s.strstart; /* current string */
  var match;                       /* matched string */
  var len;                           /* length of current match */
  var best_len = s.prev_length;              /* best match length so far */
  var nice_match = s.nice_match;             /* stop if match long enough */
  var limit = (s.strstart > (s.w_size - MIN_LOOKAHEAD)) ?
      s.strstart - (s.w_size - MIN_LOOKAHEAD) : 0/*NIL*/;

  var _win = s.window; // shortcut

  var wmask = s.w_mask;
  var prev  = s.prev;

  /* Stop when cur_match becomes <= limit. To simplify the code,
   * we prevent matches with the string of window index 0.
   */

  var strend = s.strstart + MAX_MATCH;
  var scan_end1  = _win[scan + best_len - 1];
  var scan_end   = _win[scan + best_len];

  /* The code is optimized for HASH_BITS >= 8 and MAX_MATCH-2 multiple of 16.
   * It is easy to get rid of this optimization if necessary.
   */
  // Assert(s->hash_bits >= 8 && MAX_MATCH == 258, "Code too clever");

  /* Do not waste too much time if we already have a good match: */
  if (s.prev_length >= s.good_match) {
    chain_length >>= 2;
  }
  /* Do not look for matches beyond the end of the input. This is necessary
   * to make deflate deterministic.
   */
  if (nice_match > s.lookahead) { nice_match = s.lookahead; }

  // Assert((ulg)s->strstart <= s->window_size-MIN_LOOKAHEAD, "need lookahead");

  do {
    // Assert(cur_match < s->strstart, "no future");
    match = cur_match;

    /* Skip to next match if the match length cannot increase
     * or if the match length is less than 2.  Note that the checks below
     * for insufficient lookahead only occur occasionally for performance
     * reasons.  Therefore uninitialized memory will be accessed, and
     * conditional jumps will be made that depend on those values.
     * However the length of the match is limited to the lookahead, so
     * the output of deflate is not affected by the uninitialized values.
     */

    if (_win[match + best_len]     !== scan_end  ||
        _win[match + best_len - 1] !== scan_end1 ||
        _win[match]                !== _win[scan] ||
        _win[++match]              !== _win[scan + 1]) {
      continue;
    }

    /* The check at best_len-1 can be removed because it will be made
     * again later. (This heuristic is not always a win.)
     * It is not necessary to compare scan[2] and match[2] since they
     * are always equal when the other bytes match, given that
     * the hash keys are equal and that HASH_BITS >= 8.
     */
    scan += 2;
    match++;
    // Assert(*scan == *match, "match[2]?");

    /* We check for insufficient lookahead only every 8th comparison;
     * the 256th check will be made at strstart+258.
     */
    do {
      /*jshint noempty:false*/
    } while (_win[++scan] === _win[++match] && _win[++scan] === _win[++match] &&
             _win[++scan] === _win[++match] && _win[++scan] === _win[++match] &&
             _win[++scan] === _win[++match] && _win[++scan] === _win[++match] &&
             _win[++scan] === _win[++match] && _win[++scan] === _win[++match] &&
             scan < strend);

    // Assert(scan <= s->window+(unsigned)(s->window_size-1), "wild scan");

    len = MAX_MATCH - (strend - scan);
    scan = strend - MAX_MATCH;

    if (len > best_len) {
      s.match_start = cur_match;
      best_len = len;
      if (len >= nice_match) {
        break;
      }
      scan_end1  = _win[scan + best_len - 1];
      scan_end   = _win[scan + best_len];
    }
  } while ((cur_match = prev[cur_match & wmask]) > limit && --chain_length !== 0);

  if (best_len <= s.lookahead) {
    return best_len;
  }
  return s.lookahead;
}


/* ===========================================================================
 * Fill the window when the lookahead becomes insufficient.
 * Updates strstart and lookahead.
 *
 * IN assertion: lookahead < MIN_LOOKAHEAD
 * OUT assertions: strstart <= window_size-MIN_LOOKAHEAD
 *    At least one byte has been read, or avail_in == 0; reads are
 *    performed for at least two bytes (required for the zip translate_eol
 *    option -- not supported here).
 */
function fill_window(s) {
  var _w_size = s.w_size;
  var p, n, m, more, str;

  //Assert(s->lookahead < MIN_LOOKAHEAD, "already enough lookahead");

  do {
    more = s.window_size - s.lookahead - s.strstart;

    // JS ints have 32 bit, block below not needed
    /* Deal with !@#$% 64K limit: */
    //if (sizeof(int) <= 2) {
    //    if (more == 0 && s->strstart == 0 && s->lookahead == 0) {
    //        more = wsize;
    //
    //  } else if (more == (unsigned)(-1)) {
    //        /* Very unlikely, but possible on 16 bit machine if
    //         * strstart == 0 && lookahead == 1 (input done a byte at time)
    //         */
    //        more--;
    //    }
    //}


    /* If the window is almost full and there is insufficient lookahead,
     * move the upper half to the lower one to make room in the upper half.
     */
    if (s.strstart >= _w_size + (_w_size - MIN_LOOKAHEAD)) {

      utils.arraySet(s.window, s.window, _w_size, _w_size, 0);
      s.match_start -= _w_size;
      s.strstart -= _w_size;
      /* we now have strstart >= MAX_DIST */
      s.block_start -= _w_size;

      /* Slide the hash table (could be avoided with 32 bit values
       at the expense of memory usage). We slide even when level == 0
       to keep the hash table consistent if we switch back to level > 0
       later. (Using level 0 permanently is not an optimal usage of
       zlib, so we don't care about this pathological case.)
       */

      n = s.hash_size;
      p = n;
      do {
        m = s.head[--p];
        s.head[p] = (m >= _w_size ? m - _w_size : 0);
      } while (--n);

      n = _w_size;
      p = n;
      do {
        m = s.prev[--p];
        s.prev[p] = (m >= _w_size ? m - _w_size : 0);
        /* If n is not on any hash chain, prev[n] is garbage but
         * its value will never be used.
         */
      } while (--n);

      more += _w_size;
    }
    if (s.strm.avail_in === 0) {
      break;
    }

    /* If there was no sliding:
     *    strstart <= WSIZE+MAX_DIST-1 && lookahead <= MIN_LOOKAHEAD - 1 &&
     *    more == window_size - lookahead - strstart
     * => more >= window_size - (MIN_LOOKAHEAD-1 + WSIZE + MAX_DIST-1)
     * => more >= window_size - 2*WSIZE + 2
     * In the BIG_MEM or MMAP case (not yet supported),
     *   window_size == input_size + MIN_LOOKAHEAD  &&
     *   strstart + s->lookahead <= input_size => more >= MIN_LOOKAHEAD.
     * Otherwise, window_size == 2*WSIZE so more >= 2.
     * If there was sliding, more >= WSIZE. So in all cases, more >= 2.
     */
    //Assert(more >= 2, "more < 2");
    n = read_buf(s.strm, s.window, s.strstart + s.lookahead, more);
    s.lookahead += n;

    /* Initialize the hash value now that we have some input: */
    if (s.lookahead + s.insert >= MIN_MATCH) {
      str = s.strstart - s.insert;
      s.ins_h = s.window[str];

      /* UPDATE_HASH(s, s->ins_h, s->window[str + 1]); */
      s.ins_h = ((s.ins_h << s.hash_shift) ^ s.window[str + 1]) & s.hash_mask;
//#if MIN_MATCH != 3
//        Call update_hash() MIN_MATCH-3 more times
//#endif
      while (s.insert) {
        /* UPDATE_HASH(s, s->ins_h, s->window[str + MIN_MATCH-1]); */
        s.ins_h = ((s.ins_h << s.hash_shift) ^ s.window[str + MIN_MATCH - 1]) & s.hash_mask;

        s.prev[str & s.w_mask] = s.head[s.ins_h];
        s.head[s.ins_h] = str;
        str++;
        s.insert--;
        if (s.lookahead + s.insert < MIN_MATCH) {
          break;
        }
      }
    }
    /* If the whole input has less than MIN_MATCH bytes, ins_h is garbage,
     * but this is not important since only literal bytes will be emitted.
     */

  } while (s.lookahead < MIN_LOOKAHEAD && s.strm.avail_in !== 0);

  /* If the WIN_INIT bytes after the end of the current data have never been
   * written, then zero those bytes in order to avoid memory check reports of
   * the use of uninitialized (or uninitialised as Julian writes) bytes by
   * the longest match routines.  Update the high water mark for the next
   * time through here.  WIN_INIT is set to MAX_MATCH since the longest match
   * routines allow scanning to strstart + MAX_MATCH, ignoring lookahead.
   */
//  if (s.high_water < s.window_size) {
//    var curr = s.strstart + s.lookahead;
//    var init = 0;
//
//    if (s.high_water < curr) {
//      /* Previous high water mark below current data -- zero WIN_INIT
//       * bytes or up to end of window, whichever is less.
//       */
//      init = s.window_size - curr;
//      if (init > WIN_INIT)
//        init = WIN_INIT;
//      zmemzero(s->window + curr, (unsigned)init);
//      s->high_water = curr + init;
//    }
//    else if (s->high_water < (ulg)curr + WIN_INIT) {
//      /* High water mark at or above current data, but below current data
//       * plus WIN_INIT -- zero out to current data plus WIN_INIT, or up
//       * to end of window, whichever is less.
//       */
//      init = (ulg)curr + WIN_INIT - s->high_water;
//      if (init > s->window_size - s->high_water)
//        init = s->window_size - s->high_water;
//      zmemzero(s->window + s->high_water, (unsigned)init);
//      s->high_water += init;
//    }
//  }
//
//  Assert((ulg)s->strstart <= s->window_size - MIN_LOOKAHEAD,
//    "not enough room for search");
}

/* ===========================================================================
 * Copy without compression as much as possible from the input stream, return
 * the current block state.
 * This function does not insert new strings in the dictionary since
 * uncompressible data is probably not useful. This function is used
 * only for the level=0 compression option.
 * NOTE: this function should be optimized to avoid extra copying from
 * window to pending_buf.
 */
function deflate_stored(s, flush) {
  /* Stored blocks are limited to 0xffff bytes, pending_buf is limited
   * to pending_buf_size, and each stored block has a 5 byte header:
   */
  var max_block_size = 0xffff;

  if (max_block_size > s.pending_buf_size - 5) {
    max_block_size = s.pending_buf_size - 5;
  }

  /* Copy as much as possible from input to output: */
  for (;;) {
    /* Fill the window as much as possible: */
    if (s.lookahead <= 1) {

      //Assert(s->strstart < s->w_size+MAX_DIST(s) ||
      //  s->block_start >= (long)s->w_size, "slide too late");
//      if (!(s.strstart < s.w_size + (s.w_size - MIN_LOOKAHEAD) ||
//        s.block_start >= s.w_size)) {
//        throw  new Error("slide too late");
//      }

      fill_window(s);
      if (s.lookahead === 0 && flush === Z_NO_FLUSH) {
        return BS_NEED_MORE;
      }

      if (s.lookahead === 0) {
        break;
      }
      /* flush the current block */
    }
    //Assert(s->block_start >= 0L, "block gone");
//    if (s.block_start < 0) throw new Error("block gone");

    s.strstart += s.lookahead;
    s.lookahead = 0;

    /* Emit a stored block if pending_buf will be full: */
    var max_start = s.block_start + max_block_size;

    if (s.strstart === 0 || s.strstart >= max_start) {
      /* strstart == 0 is possible when wraparound on 16-bit machine */
      s.lookahead = s.strstart - max_start;
      s.strstart = max_start;
      /*** FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
      /***/


    }
    /* Flush if we may have to slide, otherwise block_start may become
     * negative and the data will be gone:
     */
    if (s.strstart - s.block_start >= (s.w_size - MIN_LOOKAHEAD)) {
      /*** FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
      /***/
    }
  }

  s.insert = 0;

  if (flush === Z_FINISH) {
    /*** FLUSH_BLOCK(s, 1); ***/
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    /***/
    return BS_FINISH_DONE;
  }

  if (s.strstart > s.block_start) {
    /*** FLUSH_BLOCK(s, 0); ***/
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
    /***/
  }

  return BS_NEED_MORE;
}

/* ===========================================================================
 * Compress as much as possible from the input stream, return the current
 * block state.
 * This function does not perform lazy evaluation of matches and inserts
 * new strings in the dictionary only for unmatched strings or for short
 * matches. It is used only for the fast compression options.
 */
function deflate_fast(s, flush) {
  var hash_head;        /* head of the hash chain */
  var bflush;           /* set if current block must be flushed */

  for (;;) {
    /* Make sure that we always have enough lookahead, except
     * at the end of the input file. We need MAX_MATCH bytes
     * for the next match, plus MIN_MATCH bytes to insert the
     * string following the next match.
     */
    if (s.lookahead < MIN_LOOKAHEAD) {
      fill_window(s);
      if (s.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH) {
        return BS_NEED_MORE;
      }
      if (s.lookahead === 0) {
        break; /* flush the current block */
      }
    }

    /* Insert the string window[strstart .. strstart+2] in the
     * dictionary, and set hash_head to the head of the hash chain:
     */
    hash_head = 0/*NIL*/;
    if (s.lookahead >= MIN_MATCH) {
      /*** INSERT_STRING(s, s.strstart, hash_head); ***/
      s.ins_h = ((s.ins_h << s.hash_shift) ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
      hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
      s.head[s.ins_h] = s.strstart;
      /***/
    }

    /* Find the longest match, discarding those <= prev_length.
     * At this point we have always match_length < MIN_MATCH
     */
    if (hash_head !== 0/*NIL*/ && ((s.strstart - hash_head) <= (s.w_size - MIN_LOOKAHEAD))) {
      /* To simplify the code, we prevent matches with the string
       * of window index 0 (in particular we have to avoid a match
       * of the string with itself at the start of the input file).
       */
      s.match_length = longest_match(s, hash_head);
      /* longest_match() sets match_start */
    }
    if (s.match_length >= MIN_MATCH) {
      // check_match(s, s.strstart, s.match_start, s.match_length); // for debug only

      /*** _tr_tally_dist(s, s.strstart - s.match_start,
                     s.match_length - MIN_MATCH, bflush); ***/
      bflush = trees._tr_tally(s, s.strstart - s.match_start, s.match_length - MIN_MATCH);

      s.lookahead -= s.match_length;

      /* Insert new strings in the hash table only if the match length
       * is not too large. This saves time but degrades compression.
       */
      if (s.match_length <= s.max_lazy_match/*max_insert_length*/ && s.lookahead >= MIN_MATCH) {
        s.match_length--; /* string at strstart already in table */
        do {
          s.strstart++;
          /*** INSERT_STRING(s, s.strstart, hash_head); ***/
          s.ins_h = ((s.ins_h << s.hash_shift) ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
          hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
          s.head[s.ins_h] = s.strstart;
          /***/
          /* strstart never exceeds WSIZE-MAX_MATCH, so there are
           * always MIN_MATCH bytes ahead.
           */
        } while (--s.match_length !== 0);
        s.strstart++;
      } else
      {
        s.strstart += s.match_length;
        s.match_length = 0;
        s.ins_h = s.window[s.strstart];
        /* UPDATE_HASH(s, s.ins_h, s.window[s.strstart+1]); */
        s.ins_h = ((s.ins_h << s.hash_shift) ^ s.window[s.strstart + 1]) & s.hash_mask;

//#if MIN_MATCH != 3
//                Call UPDATE_HASH() MIN_MATCH-3 more times
//#endif
        /* If lookahead < MIN_MATCH, ins_h is garbage, but it does not
         * matter since it will be recomputed at next deflate call.
         */
      }
    } else {
      /* No match, output a literal byte */
      //Tracevv((stderr,"%c", s.window[s.strstart]));
      /*** _tr_tally_lit(s, s.window[s.strstart], bflush); ***/
      bflush = trees._tr_tally(s, 0, s.window[s.strstart]);

      s.lookahead--;
      s.strstart++;
    }
    if (bflush) {
      /*** FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
      /***/
    }
  }
  s.insert = ((s.strstart < (MIN_MATCH - 1)) ? s.strstart : MIN_MATCH - 1);
  if (flush === Z_FINISH) {
    /*** FLUSH_BLOCK(s, 1); ***/
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    /***/
    return BS_FINISH_DONE;
  }
  if (s.last_lit) {
    /*** FLUSH_BLOCK(s, 0); ***/
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
    /***/
  }
  return BS_BLOCK_DONE;
}

/* ===========================================================================
 * Same as above, but achieves better compression. We use a lazy
 * evaluation for matches: a match is finally adopted only if there is
 * no better match at the next window position.
 */
function deflate_slow(s, flush) {
  var hash_head;          /* head of hash chain */
  var bflush;              /* set if current block must be flushed */

  var max_insert;

  /* Process the input block. */
  for (;;) {
    /* Make sure that we always have enough lookahead, except
     * at the end of the input file. We need MAX_MATCH bytes
     * for the next match, plus MIN_MATCH bytes to insert the
     * string following the next match.
     */
    if (s.lookahead < MIN_LOOKAHEAD) {
      fill_window(s);
      if (s.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH) {
        return BS_NEED_MORE;
      }
      if (s.lookahead === 0) { break; } /* flush the current block */
    }

    /* Insert the string window[strstart .. strstart+2] in the
     * dictionary, and set hash_head to the head of the hash chain:
     */
    hash_head = 0/*NIL*/;
    if (s.lookahead >= MIN_MATCH) {
      /*** INSERT_STRING(s, s.strstart, hash_head); ***/
      s.ins_h = ((s.ins_h << s.hash_shift) ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
      hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
      s.head[s.ins_h] = s.strstart;
      /***/
    }

    /* Find the longest match, discarding those <= prev_length.
     */
    s.prev_length = s.match_length;
    s.prev_match = s.match_start;
    s.match_length = MIN_MATCH - 1;

    if (hash_head !== 0/*NIL*/ && s.prev_length < s.max_lazy_match &&
        s.strstart - hash_head <= (s.w_size - MIN_LOOKAHEAD)/*MAX_DIST(s)*/) {
      /* To simplify the code, we prevent matches with the string
       * of window index 0 (in particular we have to avoid a match
       * of the string with itself at the start of the input file).
       */
      s.match_length = longest_match(s, hash_head);
      /* longest_match() sets match_start */

      if (s.match_length <= 5 &&
         (s.strategy === Z_FILTERED || (s.match_length === MIN_MATCH && s.strstart - s.match_start > 4096/*TOO_FAR*/))) {

        /* If prev_match is also MIN_MATCH, match_start is garbage
         * but we will ignore the current match anyway.
         */
        s.match_length = MIN_MATCH - 1;
      }
    }
    /* If there was a match at the previous step and the current
     * match is not better, output the previous match:
     */
    if (s.prev_length >= MIN_MATCH && s.match_length <= s.prev_length) {
      max_insert = s.strstart + s.lookahead - MIN_MATCH;
      /* Do not insert strings in hash table beyond this. */

      //check_match(s, s.strstart-1, s.prev_match, s.prev_length);

      /***_tr_tally_dist(s, s.strstart - 1 - s.prev_match,
                     s.prev_length - MIN_MATCH, bflush);***/
      bflush = trees._tr_tally(s, s.strstart - 1 - s.prev_match, s.prev_length - MIN_MATCH);
      /* Insert in hash table all strings up to the end of the match.
       * strstart-1 and strstart are already inserted. If there is not
       * enough lookahead, the last two strings are not inserted in
       * the hash table.
       */
      s.lookahead -= s.prev_length - 1;
      s.prev_length -= 2;
      do {
        if (++s.strstart <= max_insert) {
          /*** INSERT_STRING(s, s.strstart, hash_head); ***/
          s.ins_h = ((s.ins_h << s.hash_shift) ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
          hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
          s.head[s.ins_h] = s.strstart;
          /***/
        }
      } while (--s.prev_length !== 0);
      s.match_available = 0;
      s.match_length = MIN_MATCH - 1;
      s.strstart++;

      if (bflush) {
        /*** FLUSH_BLOCK(s, 0); ***/
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
        /***/
      }

    } else if (s.match_available) {
      /* If there was no match at the previous position, output a
       * single literal. If there was a match but the current match
       * is longer, truncate the previous match to a single literal.
       */
      //Tracevv((stderr,"%c", s->window[s->strstart-1]));
      /*** _tr_tally_lit(s, s.window[s.strstart-1], bflush); ***/
      bflush = trees._tr_tally(s, 0, s.window[s.strstart - 1]);

      if (bflush) {
        /*** FLUSH_BLOCK_ONLY(s, 0) ***/
        flush_block_only(s, false);
        /***/
      }
      s.strstart++;
      s.lookahead--;
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    } else {
      /* There is no previous match to compare with, wait for
       * the next step to decide.
       */
      s.match_available = 1;
      s.strstart++;
      s.lookahead--;
    }
  }
  //Assert (flush != Z_NO_FLUSH, "no flush?");
  if (s.match_available) {
    //Tracevv((stderr,"%c", s->window[s->strstart-1]));
    /*** _tr_tally_lit(s, s.window[s.strstart-1], bflush); ***/
    bflush = trees._tr_tally(s, 0, s.window[s.strstart - 1]);

    s.match_available = 0;
  }
  s.insert = s.strstart < MIN_MATCH - 1 ? s.strstart : MIN_MATCH - 1;
  if (flush === Z_FINISH) {
    /*** FLUSH_BLOCK(s, 1); ***/
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    /***/
    return BS_FINISH_DONE;
  }
  if (s.last_lit) {
    /*** FLUSH_BLOCK(s, 0); ***/
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
    /***/
  }

  return BS_BLOCK_DONE;
}


/* ===========================================================================
 * For Z_RLE, simply look for runs of bytes, generate matches only of distance
 * one.  Do not maintain a hash table.  (It will be regenerated if this run of
 * deflate switches away from Z_RLE.)
 */
function deflate_rle(s, flush) {
  var bflush;            /* set if current block must be flushed */
  var prev;              /* byte at distance one to match */
  var scan, strend;      /* scan goes up to strend for length of run */

  var _win = s.window;

  for (;;) {
    /* Make sure that we always have enough lookahead, except
     * at the end of the input file. We need MAX_MATCH bytes
     * for the longest run, plus one for the unrolled loop.
     */
    if (s.lookahead <= MAX_MATCH) {
      fill_window(s);
      if (s.lookahead <= MAX_MATCH && flush === Z_NO_FLUSH) {
        return BS_NEED_MORE;
      }
      if (s.lookahead === 0) { break; } /* flush the current block */
    }

    /* See how many times the previous byte repeats */
    s.match_length = 0;
    if (s.lookahead >= MIN_MATCH && s.strstart > 0) {
      scan = s.strstart - 1;
      prev = _win[scan];
      if (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan]) {
        strend = s.strstart + MAX_MATCH;
        do {
          /*jshint noempty:false*/
        } while (prev === _win[++scan] && prev === _win[++scan] &&
                 prev === _win[++scan] && prev === _win[++scan] &&
                 prev === _win[++scan] && prev === _win[++scan] &&
                 prev === _win[++scan] && prev === _win[++scan] &&
                 scan < strend);
        s.match_length = MAX_MATCH - (strend - scan);
        if (s.match_length > s.lookahead) {
          s.match_length = s.lookahead;
        }
      }
      //Assert(scan <= s->window+(uInt)(s->window_size-1), "wild scan");
    }

    /* Emit match if have run of MIN_MATCH or longer, else emit literal */
    if (s.match_length >= MIN_MATCH) {
      //check_match(s, s.strstart, s.strstart - 1, s.match_length);

      /*** _tr_tally_dist(s, 1, s.match_length - MIN_MATCH, bflush); ***/
      bflush = trees._tr_tally(s, 1, s.match_length - MIN_MATCH);

      s.lookahead -= s.match_length;
      s.strstart += s.match_length;
      s.match_length = 0;
    } else {
      /* No match, output a literal byte */
      //Tracevv((stderr,"%c", s->window[s->strstart]));
      /*** _tr_tally_lit(s, s.window[s.strstart], bflush); ***/
      bflush = trees._tr_tally(s, 0, s.window[s.strstart]);

      s.lookahead--;
      s.strstart++;
    }
    if (bflush) {
      /*** FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
      /***/
    }
  }
  s.insert = 0;
  if (flush === Z_FINISH) {
    /*** FLUSH_BLOCK(s, 1); ***/
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    /***/
    return BS_FINISH_DONE;
  }
  if (s.last_lit) {
    /*** FLUSH_BLOCK(s, 0); ***/
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
    /***/
  }
  return BS_BLOCK_DONE;
}

/* ===========================================================================
 * For Z_HUFFMAN_ONLY, do not look for matches.  Do not maintain a hash table.
 * (It will be regenerated if this run of deflate switches away from Huffman.)
 */
function deflate_huff(s, flush) {
  var bflush;             /* set if current block must be flushed */

  for (;;) {
    /* Make sure that we have a literal to write. */
    if (s.lookahead === 0) {
      fill_window(s);
      if (s.lookahead === 0) {
        if (flush === Z_NO_FLUSH) {
          return BS_NEED_MORE;
        }
        break;      /* flush the current block */
      }
    }

    /* Output a literal byte */
    s.match_length = 0;
    //Tracevv((stderr,"%c", s->window[s->strstart]));
    /*** _tr_tally_lit(s, s.window[s.strstart], bflush); ***/
    bflush = trees._tr_tally(s, 0, s.window[s.strstart]);
    s.lookahead--;
    s.strstart++;
    if (bflush) {
      /*** FLUSH_BLOCK(s, 0); ***/
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
      /***/
    }
  }
  s.insert = 0;
  if (flush === Z_FINISH) {
    /*** FLUSH_BLOCK(s, 1); ***/
    flush_block_only(s, true);
    if (s.strm.avail_out === 0) {
      return BS_FINISH_STARTED;
    }
    /***/
    return BS_FINISH_DONE;
  }
  if (s.last_lit) {
    /*** FLUSH_BLOCK(s, 0); ***/
    flush_block_only(s, false);
    if (s.strm.avail_out === 0) {
      return BS_NEED_MORE;
    }
    /***/
  }
  return BS_BLOCK_DONE;
}

/* Values for max_lazy_match, good_match and max_chain_length, depending on
 * the desired pack level (0..9). The values given below have been tuned to
 * exclude worst case performance for pathological files. Better values may be
 * found for specific files.
 */
function Config(good_length, max_lazy, nice_length, max_chain, func) {
  this.good_length = good_length;
  this.max_lazy = max_lazy;
  this.nice_length = nice_length;
  this.max_chain = max_chain;
  this.func = func;
}

var configuration_table;

configuration_table = [
  /*      good lazy nice chain */
  new Config(0, 0, 0, 0, deflate_stored),          /* 0 store only */
  new Config(4, 4, 8, 4, deflate_fast),            /* 1 max speed, no lazy matches */
  new Config(4, 5, 16, 8, deflate_fast),           /* 2 */
  new Config(4, 6, 32, 32, deflate_fast),          /* 3 */

  new Config(4, 4, 16, 16, deflate_slow),          /* 4 lazy matches */
  new Config(8, 16, 32, 32, deflate_slow),         /* 5 */
  new Config(8, 16, 128, 128, deflate_slow),       /* 6 */
  new Config(8, 32, 128, 256, deflate_slow),       /* 7 */
  new Config(32, 128, 258, 1024, deflate_slow),    /* 8 */
  new Config(32, 258, 258, 4096, deflate_slow)     /* 9 max compression */
];


/* ===========================================================================
 * Initialize the "longest match" routines for a new zlib stream
 */
function lm_init(s) {
  s.window_size = 2 * s.w_size;

  /*** CLEAR_HASH(s); ***/
  zero(s.head); // Fill with NIL (= 0);

  /* Set the default configuration parameters:
   */
  s.max_lazy_match = configuration_table[s.level].max_lazy;
  s.good_match = configuration_table[s.level].good_length;
  s.nice_match = configuration_table[s.level].nice_length;
  s.max_chain_length = configuration_table[s.level].max_chain;

  s.strstart = 0;
  s.block_start = 0;
  s.lookahead = 0;
  s.insert = 0;
  s.match_length = s.prev_length = MIN_MATCH - 1;
  s.match_available = 0;
  s.ins_h = 0;
}


function DeflateState() {
  this.strm = null;            /* pointer back to this zlib stream */
  this.status = 0;            /* as the name implies */
  this.pending_buf = null;      /* output still pending */
  this.pending_buf_size = 0;  /* size of pending_buf */
  this.pending_out = 0;       /* next pending byte to output to the stream */
  this.pending = 0;           /* nb of bytes in the pending buffer */
  this.wrap = 0;              /* bit 0 true for zlib, bit 1 true for gzip */
  this.gzhead = null;         /* gzip header information to write */
  this.gzindex = 0;           /* where in extra, name, or comment */
  this.method = Z_DEFLATED; /* can only be DEFLATED */
  this.last_flush = -1;   /* value of flush param for previous deflate call */

  this.w_size = 0;  /* LZ77 window size (32K by default) */
  this.w_bits = 0;  /* log2(w_size)  (8..16) */
  this.w_mask = 0;  /* w_size - 1 */

  this.window = null;
  /* Sliding window. Input bytes are read into the second half of the window,
   * and move to the first half later to keep a dictionary of at least wSize
   * bytes. With this organization, matches are limited to a distance of
   * wSize-MAX_MATCH bytes, but this ensures that IO is always
   * performed with a length multiple of the block size.
   */

  this.window_size = 0;
  /* Actual size of window: 2*wSize, except when the user input buffer
   * is directly used as sliding window.
   */

  this.prev = null;
  /* Link to older string with same hash index. To limit the size of this
   * array to 64K, this link is maintained only for the last 32K strings.
   * An index in this array is thus a window index modulo 32K.
   */

  this.head = null;   /* Heads of the hash chains or NIL. */

  this.ins_h = 0;       /* hash index of string to be inserted */
  this.hash_size = 0;   /* number of elements in hash table */
  this.hash_bits = 0;   /* log2(hash_size) */
  this.hash_mask = 0;   /* hash_size-1 */

  this.hash_shift = 0;
  /* Number of bits by which ins_h must be shifted at each input
   * step. It must be such that after MIN_MATCH steps, the oldest
   * byte no longer takes part in the hash key, that is:
   *   hash_shift * MIN_MATCH >= hash_bits
   */

  this.block_start = 0;
  /* Window position at the beginning of the current output block. Gets
   * negative when the window is moved backwards.
   */

  this.match_length = 0;      /* length of best match */
  this.prev_match = 0;        /* previous match */
  this.match_available = 0;   /* set if previous match exists */
  this.strstart = 0;          /* start of string to insert */
  this.match_start = 0;       /* start of matching string */
  this.lookahead = 0;         /* number of valid bytes ahead in window */

  this.prev_length = 0;
  /* Length of the best match at previous step. Matches not greater than this
   * are discarded. This is used in the lazy match evaluation.
   */

  this.max_chain_length = 0;
  /* To speed up deflation, hash chains are never searched beyond this
   * length.  A higher limit improves compression ratio but degrades the
   * speed.
   */

  this.max_lazy_match = 0;
  /* Attempt to find a better match only when the current match is strictly
   * smaller than this value. This mechanism is used only for compression
   * levels >= 4.
   */
  // That's alias to max_lazy_match, don't use directly
  //this.max_insert_length = 0;
  /* Insert new strings in the hash table only if the match length is not
   * greater than this length. This saves time but degrades compression.
   * max_insert_length is used only for compression levels <= 3.
   */

  this.level = 0;     /* compression level (1..9) */
  this.strategy = 0;  /* favor or force Huffman coding*/

  this.good_match = 0;
  /* Use a faster search when the previous match is longer than this */

  this.nice_match = 0; /* Stop searching when current match exceeds this */

              /* used by trees.c: */

  /* Didn't use ct_data typedef below to suppress compiler warning */

  // struct ct_data_s dyn_ltree[HEAP_SIZE];   /* literal and length tree */
  // struct ct_data_s dyn_dtree[2*D_CODES+1]; /* distance tree */
  // struct ct_data_s bl_tree[2*BL_CODES+1];  /* Huffman tree for bit lengths */

  // Use flat array of DOUBLE size, with interleaved fata,
  // because JS does not support effective
  this.dyn_ltree  = new utils.Buf16(HEAP_SIZE * 2);
  this.dyn_dtree  = new utils.Buf16((2 * D_CODES + 1) * 2);
  this.bl_tree    = new utils.Buf16((2 * BL_CODES + 1) * 2);
  zero(this.dyn_ltree);
  zero(this.dyn_dtree);
  zero(this.bl_tree);

  this.l_desc   = null;         /* desc. for literal tree */
  this.d_desc   = null;         /* desc. for distance tree */
  this.bl_desc  = null;         /* desc. for bit length tree */

  //ush bl_count[MAX_BITS+1];
  this.bl_count = new utils.Buf16(MAX_BITS + 1);
  /* number of codes at each bit length for an optimal tree */

  //int heap[2*L_CODES+1];      /* heap used to build the Huffman trees */
  this.heap = new utils.Buf16(2 * L_CODES + 1);  /* heap used to build the Huffman trees */
  zero(this.heap);

  this.heap_len = 0;               /* number of elements in the heap */
  this.heap_max = 0;               /* element of largest frequency */
  /* The sons of heap[n] are heap[2*n] and heap[2*n+1]. heap[0] is not used.
   * The same heap array is used to build all trees.
   */

  this.depth = new utils.Buf16(2 * L_CODES + 1); //uch depth[2*L_CODES+1];
  zero(this.depth);
  /* Depth of each subtree used as tie breaker for trees of equal frequency
   */

  this.l_buf = 0;          /* buffer index for literals or lengths */

  this.lit_bufsize = 0;
  /* Size of match buffer for literals/lengths.  There are 4 reasons for
   * limiting lit_bufsize to 64K:
   *   - frequencies can be kept in 16 bit counters
   *   - if compression is not successful for the first block, all input
   *     data is still in the window so we can still emit a stored block even
   *     when input comes from standard input.  (This can also be done for
   *     all blocks if lit_bufsize is not greater than 32K.)
   *   - if compression is not successful for a file smaller than 64K, we can
   *     even emit a stored file instead of a stored block (saving 5 bytes).
   *     This is applicable only for zip (not gzip or zlib).
   *   - creating new Huffman trees less frequently may not provide fast
   *     adaptation to changes in the input data statistics. (Take for
   *     example a binary file with poorly compressible code followed by
   *     a highly compressible string table.) Smaller buffer sizes give
   *     fast adaptation but have of course the overhead of transmitting
   *     trees more frequently.
   *   - I can't count above 4
   */

  this.last_lit = 0;      /* running index in l_buf */

  this.d_buf = 0;
  /* Buffer index for distances. To simplify the code, d_buf and l_buf have
   * the same number of elements. To use different lengths, an extra flag
   * array would be necessary.
   */

  this.opt_len = 0;       /* bit length of current block with optimal trees */
  this.static_len = 0;    /* bit length of current block with static trees */
  this.matches = 0;       /* number of string matches in current block */
  this.insert = 0;        /* bytes at end of window left to insert */


  this.bi_buf = 0;
  /* Output buffer. bits are inserted starting at the bottom (least
   * significant bits).
   */
  this.bi_valid = 0;
  /* Number of valid bits in bi_buf.  All bits above the last valid bit
   * are always zero.
   */

  // Used for window memory init. We safely ignore it for JS. That makes
  // sense only for pointers and memory check tools.
  //this.high_water = 0;
  /* High water mark offset in window for initialized bytes -- bytes above
   * this are set to zero in order to avoid memory check warnings when
   * longest match routines access bytes past the input.  This is then
   * updated to the new high water mark.
   */
}


function deflateResetKeep(strm) {
  var s;

  if (!strm || !strm.state) {
    return err(strm, Z_STREAM_ERROR);
  }

  strm.total_in = strm.total_out = 0;
  strm.data_type = Z_UNKNOWN;

  s = strm.state;
  s.pending = 0;
  s.pending_out = 0;

  if (s.wrap < 0) {
    s.wrap = -s.wrap;
    /* was made negative by deflate(..., Z_FINISH); */
  }
  s.status = (s.wrap ? INIT_STATE : BUSY_STATE);
  strm.adler = (s.wrap === 2) ?
    0  // crc32(0, Z_NULL, 0)
  :
    1; // adler32(0, Z_NULL, 0)
  s.last_flush = Z_NO_FLUSH;
  trees._tr_init(s);
  return Z_OK;
}


function deflateReset(strm) {
  var ret = deflateResetKeep(strm);
  if (ret === Z_OK) {
    lm_init(strm.state);
  }
  return ret;
}


function deflateSetHeader(strm, head) {
  if (!strm || !strm.state) { return Z_STREAM_ERROR; }
  if (strm.state.wrap !== 2) { return Z_STREAM_ERROR; }
  strm.state.gzhead = head;
  return Z_OK;
}


function deflateInit2(strm, level, method, windowBits, memLevel, strategy) {
  if (!strm) { // === Z_NULL
    return Z_STREAM_ERROR;
  }
  var wrap = 1;

  if (level === Z_DEFAULT_COMPRESSION) {
    level = 6;
  }

  if (windowBits < 0) { /* suppress zlib wrapper */
    wrap = 0;
    windowBits = -windowBits;
  }

  else if (windowBits > 15) {
    wrap = 2;           /* write gzip wrapper instead */
    windowBits -= 16;
  }


  if (memLevel < 1 || memLevel > MAX_MEM_LEVEL || method !== Z_DEFLATED ||
    windowBits < 8 || windowBits > 15 || level < 0 || level > 9 ||
    strategy < 0 || strategy > Z_FIXED) {
    return err(strm, Z_STREAM_ERROR);
  }


  if (windowBits === 8) {
    windowBits = 9;
  }
  /* until 256-byte window bug fixed */

  var s = new DeflateState();

  strm.state = s;
  s.strm = strm;

  s.wrap = wrap;
  s.gzhead = null;
  s.w_bits = windowBits;
  s.w_size = 1 << s.w_bits;
  s.w_mask = s.w_size - 1;

  s.hash_bits = memLevel + 7;
  s.hash_size = 1 << s.hash_bits;
  s.hash_mask = s.hash_size - 1;
  s.hash_shift = ~~((s.hash_bits + MIN_MATCH - 1) / MIN_MATCH);

  s.window = new utils.Buf8(s.w_size * 2);
  s.head = new utils.Buf16(s.hash_size);
  s.prev = new utils.Buf16(s.w_size);

  // Don't need mem init magic for JS.
  //s.high_water = 0;  /* nothing written to s->window yet */

  s.lit_bufsize = 1 << (memLevel + 6); /* 16K elements by default */

  s.pending_buf_size = s.lit_bufsize * 4;

  //overlay = (ushf *) ZALLOC(strm, s->lit_bufsize, sizeof(ush)+2);
  //s->pending_buf = (uchf *) overlay;
  s.pending_buf = new utils.Buf8(s.pending_buf_size);

  // It is offset from `s.pending_buf` (size is `s.lit_bufsize * 2`)
  //s->d_buf = overlay + s->lit_bufsize/sizeof(ush);
  s.d_buf = 1 * s.lit_bufsize;

  //s->l_buf = s->pending_buf + (1+sizeof(ush))*s->lit_bufsize;
  s.l_buf = (1 + 2) * s.lit_bufsize;

  s.level = level;
  s.strategy = strategy;
  s.method = method;

  return deflateReset(strm);
}

function deflateInit(strm, level) {
  return deflateInit2(strm, level, Z_DEFLATED, MAX_WBITS, DEF_MEM_LEVEL, Z_DEFAULT_STRATEGY);
}


function deflate(strm, flush) {
  var old_flush, s;
  var beg, val; // for gzip header write only

  if (!strm || !strm.state ||
    flush > Z_BLOCK || flush < 0) {
    return strm ? err(strm, Z_STREAM_ERROR) : Z_STREAM_ERROR;
  }

  s = strm.state;

  if (!strm.output ||
      (!strm.input && strm.avail_in !== 0) ||
      (s.status === FINISH_STATE && flush !== Z_FINISH)) {
    return err(strm, (strm.avail_out === 0) ? Z_BUF_ERROR : Z_STREAM_ERROR);
  }

  s.strm = strm; /* just in case */
  old_flush = s.last_flush;
  s.last_flush = flush;

  /* Write the header */
  if (s.status === INIT_STATE) {

    if (s.wrap === 2) { // GZIP header
      strm.adler = 0;  //crc32(0L, Z_NULL, 0);
      put_byte(s, 31);
      put_byte(s, 139);
      put_byte(s, 8);
      if (!s.gzhead) { // s->gzhead == Z_NULL
        put_byte(s, 0);
        put_byte(s, 0);
        put_byte(s, 0);
        put_byte(s, 0);
        put_byte(s, 0);
        put_byte(s, s.level === 9 ? 2 :
                    (s.strategy >= Z_HUFFMAN_ONLY || s.level < 2 ?
                     4 : 0));
        put_byte(s, OS_CODE);
        s.status = BUSY_STATE;
      }
      else {
        put_byte(s, (s.gzhead.text ? 1 : 0) +
                    (s.gzhead.hcrc ? 2 : 0) +
                    (!s.gzhead.extra ? 0 : 4) +
                    (!s.gzhead.name ? 0 : 8) +
                    (!s.gzhead.comment ? 0 : 16)
        );
        put_byte(s, s.gzhead.time & 0xff);
        put_byte(s, (s.gzhead.time >> 8) & 0xff);
        put_byte(s, (s.gzhead.time >> 16) & 0xff);
        put_byte(s, (s.gzhead.time >> 24) & 0xff);
        put_byte(s, s.level === 9 ? 2 :
                    (s.strategy >= Z_HUFFMAN_ONLY || s.level < 2 ?
                     4 : 0));
        put_byte(s, s.gzhead.os & 0xff);
        if (s.gzhead.extra && s.gzhead.extra.length) {
          put_byte(s, s.gzhead.extra.length & 0xff);
          put_byte(s, (s.gzhead.extra.length >> 8) & 0xff);
        }
        if (s.gzhead.hcrc) {
          strm.adler = crc32(strm.adler, s.pending_buf, s.pending, 0);
        }
        s.gzindex = 0;
        s.status = EXTRA_STATE;
      }
    }
    else // DEFLATE header
    {
      var header = (Z_DEFLATED + ((s.w_bits - 8) << 4)) << 8;
      var level_flags = -1;

      if (s.strategy >= Z_HUFFMAN_ONLY || s.level < 2) {
        level_flags = 0;
      } else if (s.level < 6) {
        level_flags = 1;
      } else if (s.level === 6) {
        level_flags = 2;
      } else {
        level_flags = 3;
      }
      header |= (level_flags << 6);
      if (s.strstart !== 0) { header |= PRESET_DICT; }
      header += 31 - (header % 31);

      s.status = BUSY_STATE;
      putShortMSB(s, header);

      /* Save the adler32 of the preset dictionary: */
      if (s.strstart !== 0) {
        putShortMSB(s, strm.adler >>> 16);
        putShortMSB(s, strm.adler & 0xffff);
      }
      strm.adler = 1; // adler32(0L, Z_NULL, 0);
    }
  }

//#ifdef GZIP
  if (s.status === EXTRA_STATE) {
    if (s.gzhead.extra/* != Z_NULL*/) {
      beg = s.pending;  /* start of bytes to update crc */

      while (s.gzindex < (s.gzhead.extra.length & 0xffff)) {
        if (s.pending === s.pending_buf_size) {
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          flush_pending(strm);
          beg = s.pending;
          if (s.pending === s.pending_buf_size) {
            break;
          }
        }
        put_byte(s, s.gzhead.extra[s.gzindex] & 0xff);
        s.gzindex++;
      }
      if (s.gzhead.hcrc && s.pending > beg) {
        strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
      }
      if (s.gzindex === s.gzhead.extra.length) {
        s.gzindex = 0;
        s.status = NAME_STATE;
      }
    }
    else {
      s.status = NAME_STATE;
    }
  }
  if (s.status === NAME_STATE) {
    if (s.gzhead.name/* != Z_NULL*/) {
      beg = s.pending;  /* start of bytes to update crc */
      //int val;

      do {
        if (s.pending === s.pending_buf_size) {
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          flush_pending(strm);
          beg = s.pending;
          if (s.pending === s.pending_buf_size) {
            val = 1;
            break;
          }
        }
        // JS specific: little magic to add zero terminator to end of string
        if (s.gzindex < s.gzhead.name.length) {
          val = s.gzhead.name.charCodeAt(s.gzindex++) & 0xff;
        } else {
          val = 0;
        }
        put_byte(s, val);
      } while (val !== 0);

      if (s.gzhead.hcrc && s.pending > beg) {
        strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
      }
      if (val === 0) {
        s.gzindex = 0;
        s.status = COMMENT_STATE;
      }
    }
    else {
      s.status = COMMENT_STATE;
    }
  }
  if (s.status === COMMENT_STATE) {
    if (s.gzhead.comment/* != Z_NULL*/) {
      beg = s.pending;  /* start of bytes to update crc */
      //int val;

      do {
        if (s.pending === s.pending_buf_size) {
          if (s.gzhead.hcrc && s.pending > beg) {
            strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
          }
          flush_pending(strm);
          beg = s.pending;
          if (s.pending === s.pending_buf_size) {
            val = 1;
            break;
          }
        }
        // JS specific: little magic to add zero terminator to end of string
        if (s.gzindex < s.gzhead.comment.length) {
          val = s.gzhead.comment.charCodeAt(s.gzindex++) & 0xff;
        } else {
          val = 0;
        }
        put_byte(s, val);
      } while (val !== 0);

      if (s.gzhead.hcrc && s.pending > beg) {
        strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
      }
      if (val === 0) {
        s.status = HCRC_STATE;
      }
    }
    else {
      s.status = HCRC_STATE;
    }
  }
  if (s.status === HCRC_STATE) {
    if (s.gzhead.hcrc) {
      if (s.pending + 2 > s.pending_buf_size) {
        flush_pending(strm);
      }
      if (s.pending + 2 <= s.pending_buf_size) {
        put_byte(s, strm.adler & 0xff);
        put_byte(s, (strm.adler >> 8) & 0xff);
        strm.adler = 0; //crc32(0L, Z_NULL, 0);
        s.status = BUSY_STATE;
      }
    }
    else {
      s.status = BUSY_STATE;
    }
  }
//#endif

  /* Flush as much pending output as possible */
  if (s.pending !== 0) {
    flush_pending(strm);
    if (strm.avail_out === 0) {
      /* Since avail_out is 0, deflate will be called again with
       * more output space, but possibly with both pending and
       * avail_in equal to zero. There won't be anything to do,
       * but this is not an error situation so make sure we
       * return OK instead of BUF_ERROR at next call of deflate:
       */
      s.last_flush = -1;
      return Z_OK;
    }

    /* Make sure there is something to do and avoid duplicate consecutive
     * flushes. For repeated and useless calls with Z_FINISH, we keep
     * returning Z_STREAM_END instead of Z_BUF_ERROR.
     */
  } else if (strm.avail_in === 0 && rank(flush) <= rank(old_flush) &&
    flush !== Z_FINISH) {
    return err(strm, Z_BUF_ERROR);
  }

  /* User must not provide more input after the first FINISH: */
  if (s.status === FINISH_STATE && strm.avail_in !== 0) {
    return err(strm, Z_BUF_ERROR);
  }

  /* Start a new block or continue the current one.
   */
  if (strm.avail_in !== 0 || s.lookahead !== 0 ||
    (flush !== Z_NO_FLUSH && s.status !== FINISH_STATE)) {
    var bstate = (s.strategy === Z_HUFFMAN_ONLY) ? deflate_huff(s, flush) :
      (s.strategy === Z_RLE ? deflate_rle(s, flush) :
        configuration_table[s.level].func(s, flush));

    if (bstate === BS_FINISH_STARTED || bstate === BS_FINISH_DONE) {
      s.status = FINISH_STATE;
    }
    if (bstate === BS_NEED_MORE || bstate === BS_FINISH_STARTED) {
      if (strm.avail_out === 0) {
        s.last_flush = -1;
        /* avoid BUF_ERROR next call, see above */
      }
      return Z_OK;
      /* If flush != Z_NO_FLUSH && avail_out == 0, the next call
       * of deflate should use the same flush parameter to make sure
       * that the flush is complete. So we don't have to output an
       * empty block here, this will be done at next call. This also
       * ensures that for a very small output buffer, we emit at most
       * one empty block.
       */
    }
    if (bstate === BS_BLOCK_DONE) {
      if (flush === Z_PARTIAL_FLUSH) {
        trees._tr_align(s);
      }
      else if (flush !== Z_BLOCK) { /* FULL_FLUSH or SYNC_FLUSH */

        trees._tr_stored_block(s, 0, 0, false);
        /* For a full flush, this empty block will be recognized
         * as a special marker by inflate_sync().
         */
        if (flush === Z_FULL_FLUSH) {
          /*** CLEAR_HASH(s); ***/             /* forget history */
          zero(s.head); // Fill with NIL (= 0);

          if (s.lookahead === 0) {
            s.strstart = 0;
            s.block_start = 0;
            s.insert = 0;
          }
        }
      }
      flush_pending(strm);
      if (strm.avail_out === 0) {
        s.last_flush = -1; /* avoid BUF_ERROR at next call, see above */
        return Z_OK;
      }
    }
  }
  //Assert(strm->avail_out > 0, "bug2");
  //if (strm.avail_out <= 0) { throw new Error("bug2");}

  if (flush !== Z_FINISH) { return Z_OK; }
  if (s.wrap <= 0) { return Z_STREAM_END; }

  /* Write the trailer */
  if (s.wrap === 2) {
    put_byte(s, strm.adler & 0xff);
    put_byte(s, (strm.adler >> 8) & 0xff);
    put_byte(s, (strm.adler >> 16) & 0xff);
    put_byte(s, (strm.adler >> 24) & 0xff);
    put_byte(s, strm.total_in & 0xff);
    put_byte(s, (strm.total_in >> 8) & 0xff);
    put_byte(s, (strm.total_in >> 16) & 0xff);
    put_byte(s, (strm.total_in >> 24) & 0xff);
  }
  else
  {
    putShortMSB(s, strm.adler >>> 16);
    putShortMSB(s, strm.adler & 0xffff);
  }

  flush_pending(strm);
  /* If avail_out is zero, the application will call deflate again
   * to flush the rest.
   */
  if (s.wrap > 0) { s.wrap = -s.wrap; }
  /* write the trailer only once! */
  return s.pending !== 0 ? Z_OK : Z_STREAM_END;
}

function deflateEnd(strm) {
  var status;

  if (!strm/*== Z_NULL*/ || !strm.state/*== Z_NULL*/) {
    return Z_STREAM_ERROR;
  }

  status = strm.state.status;
  if (status !== INIT_STATE &&
    status !== EXTRA_STATE &&
    status !== NAME_STATE &&
    status !== COMMENT_STATE &&
    status !== HCRC_STATE &&
    status !== BUSY_STATE &&
    status !== FINISH_STATE
  ) {
    return err(strm, Z_STREAM_ERROR);
  }

  strm.state = null;

  return status === BUSY_STATE ? err(strm, Z_DATA_ERROR) : Z_OK;
}


/* =========================================================================
 * Initializes the compression dictionary from the given byte
 * sequence without producing any compressed output.
 */
function deflateSetDictionary(strm, dictionary) {
  var dictLength = dictionary.length;

  var s;
  var str, n;
  var wrap;
  var avail;
  var next;
  var input;
  var tmpDict;

  if (!strm/*== Z_NULL*/ || !strm.state/*== Z_NULL*/) {
    return Z_STREAM_ERROR;
  }

  s = strm.state;
  wrap = s.wrap;

  if (wrap === 2 || (wrap === 1 && s.status !== INIT_STATE) || s.lookahead) {
    return Z_STREAM_ERROR;
  }

  /* when using zlib wrappers, compute Adler-32 for provided dictionary */
  if (wrap === 1) {
    /* adler32(strm->adler, dictionary, dictLength); */
    strm.adler = adler32(strm.adler, dictionary, dictLength, 0);
  }

  s.wrap = 0;   /* avoid computing Adler-32 in read_buf */

  /* if dictionary would fill window, just replace the history */
  if (dictLength >= s.w_size) {
    if (wrap === 0) {            /* already empty otherwise */
      /*** CLEAR_HASH(s); ***/
      zero(s.head); // Fill with NIL (= 0);
      s.strstart = 0;
      s.block_start = 0;
      s.insert = 0;
    }
    /* use the tail */
    // dictionary = dictionary.slice(dictLength - s.w_size);
    tmpDict = new utils.Buf8(s.w_size);
    utils.arraySet(tmpDict, dictionary, dictLength - s.w_size, s.w_size, 0);
    dictionary = tmpDict;
    dictLength = s.w_size;
  }
  /* insert dictionary into window and hash */
  avail = strm.avail_in;
  next = strm.next_in;
  input = strm.input;
  strm.avail_in = dictLength;
  strm.next_in = 0;
  strm.input = dictionary;
  fill_window(s);
  while (s.lookahead >= MIN_MATCH) {
    str = s.strstart;
    n = s.lookahead - (MIN_MATCH - 1);
    do {
      /* UPDATE_HASH(s, s->ins_h, s->window[str + MIN_MATCH-1]); */
      s.ins_h = ((s.ins_h << s.hash_shift) ^ s.window[str + MIN_MATCH - 1]) & s.hash_mask;

      s.prev[str & s.w_mask] = s.head[s.ins_h];

      s.head[s.ins_h] = str;
      str++;
    } while (--n);
    s.strstart = str;
    s.lookahead = MIN_MATCH - 1;
    fill_window(s);
  }
  s.strstart += s.lookahead;
  s.block_start = s.strstart;
  s.insert = s.lookahead;
  s.lookahead = 0;
  s.match_length = s.prev_length = MIN_MATCH - 1;
  s.match_available = 0;
  strm.next_in = next;
  strm.input = input;
  strm.avail_in = avail;
  s.wrap = wrap;
  return Z_OK;
}


exports.deflateInit = deflateInit;
exports.deflateInit2 = deflateInit2;
exports.deflateReset = deflateReset;
exports.deflateResetKeep = deflateResetKeep;
exports.deflateSetHeader = deflateSetHeader;
exports.deflate = deflate;
exports.deflateEnd = deflateEnd;
exports.deflateSetDictionary = deflateSetDictionary;
exports.deflateInfo = 'pako deflate (from Nodeca project)';

/* Not implemented
exports.deflateBound = deflateBound;
exports.deflateCopy = deflateCopy;
exports.deflateParams = deflateParams;
exports.deflatePending = deflatePending;
exports.deflatePrime = deflatePrime;
exports.deflateTune = deflateTune;
*/

},{"../utils/common":25,"./adler32":26,"./crc32":28,"./messages":33,"./trees":34}],30:[function(require,module,exports){
'use strict';

// (C) 1995-2013 Jean-loup Gailly and Mark Adler
// (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
//
// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.
//
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:
//
// 1. The origin of this software must not be misrepresented; you must not
//   claim that you wrote the original software. If you use this software
//   in a product, an acknowledgment in the product documentation would be
//   appreciated but is not required.
// 2. Altered source versions must be plainly marked as such, and must not be
//   misrepresented as being the original software.
// 3. This notice may not be removed or altered from any source distribution.

// See state defs from inflate.js
var BAD = 30;       /* got a data error -- remain here until reset */
var TYPE = 12;      /* i: waiting for type bits, including last-flag bit */

/*
   Decode literal, length, and distance codes and write out the resulting
   literal and match bytes until either not enough input or output is
   available, an end-of-block is encountered, or a data error is encountered.
   When large enough input and output buffers are supplied to inflate(), for
   example, a 16K input buffer and a 64K output buffer, more than 95% of the
   inflate execution time is spent in this routine.

   Entry assumptions:

        state.mode === LEN
        strm.avail_in >= 6
        strm.avail_out >= 258
        start >= strm.avail_out
        state.bits < 8

   On return, state.mode is one of:

        LEN -- ran out of enough output space or enough available input
        TYPE -- reached end of block code, inflate() to interpret next block
        BAD -- error in block data

   Notes:

    - The maximum input bits used by a length/distance pair is 15 bits for the
      length code, 5 bits for the length extra, 15 bits for the distance code,
      and 13 bits for the distance extra.  This totals 48 bits, or six bytes.
      Therefore if strm.avail_in >= 6, then there is enough input to avoid
      checking for available input while decoding.

    - The maximum bytes that a single length/distance pair can output is 258
      bytes, which is the maximum length that can be coded.  inflate_fast()
      requires strm.avail_out >= 258 for each loop to avoid checking for
      output space.
 */
module.exports = function inflate_fast(strm, start) {
  var state;
  var _in;                    /* local strm.input */
  var last;                   /* have enough input while in < last */
  var _out;                   /* local strm.output */
  var beg;                    /* inflate()'s initial strm.output */
  var end;                    /* while out < end, enough space available */
//#ifdef INFLATE_STRICT
  var dmax;                   /* maximum distance from zlib header */
//#endif
  var wsize;                  /* window size or zero if not using window */
  var whave;                  /* valid bytes in the window */
  var wnext;                  /* window write index */
  // Use `s_window` instead `window`, avoid conflict with instrumentation tools
  var s_window;               /* allocated sliding window, if wsize != 0 */
  var hold;                   /* local strm.hold */
  var bits;                   /* local strm.bits */
  var lcode;                  /* local strm.lencode */
  var dcode;                  /* local strm.distcode */
  var lmask;                  /* mask for first level of length codes */
  var dmask;                  /* mask for first level of distance codes */
  var here;                   /* retrieved table entry */
  var op;                     /* code bits, operation, extra bits, or */
                              /*  window position, window bytes to copy */
  var len;                    /* match length, unused bytes */
  var dist;                   /* match distance */
  var from;                   /* where to copy match from */
  var from_source;


  var input, output; // JS specific, because we have no pointers

  /* copy state to local variables */
  state = strm.state;
  //here = state.here;
  _in = strm.next_in;
  input = strm.input;
  last = _in + (strm.avail_in - 5);
  _out = strm.next_out;
  output = strm.output;
  beg = _out - (start - strm.avail_out);
  end = _out + (strm.avail_out - 257);
//#ifdef INFLATE_STRICT
  dmax = state.dmax;
//#endif
  wsize = state.wsize;
  whave = state.whave;
  wnext = state.wnext;
  s_window = state.window;
  hold = state.hold;
  bits = state.bits;
  lcode = state.lencode;
  dcode = state.distcode;
  lmask = (1 << state.lenbits) - 1;
  dmask = (1 << state.distbits) - 1;


  /* decode literals and length/distances until end-of-block or not enough
     input data or output space */

  top:
  do {
    if (bits < 15) {
      hold += input[_in++] << bits;
      bits += 8;
      hold += input[_in++] << bits;
      bits += 8;
    }

    here = lcode[hold & lmask];

    dolen:
    for (;;) { // Goto emulation
      op = here >>> 24/*here.bits*/;
      hold >>>= op;
      bits -= op;
      op = (here >>> 16) & 0xff/*here.op*/;
      if (op === 0) {                          /* literal */
        //Tracevv((stderr, here.val >= 0x20 && here.val < 0x7f ?
        //        "inflate:         literal '%c'\n" :
        //        "inflate:         literal 0x%02x\n", here.val));
        output[_out++] = here & 0xffff/*here.val*/;
      }
      else if (op & 16) {                     /* length base */
        len = here & 0xffff/*here.val*/;
        op &= 15;                           /* number of extra bits */
        if (op) {
          if (bits < op) {
            hold += input[_in++] << bits;
            bits += 8;
          }
          len += hold & ((1 << op) - 1);
          hold >>>= op;
          bits -= op;
        }
        //Tracevv((stderr, "inflate:         length %u\n", len));
        if (bits < 15) {
          hold += input[_in++] << bits;
          bits += 8;
          hold += input[_in++] << bits;
          bits += 8;
        }
        here = dcode[hold & dmask];

        dodist:
        for (;;) { // goto emulation
          op = here >>> 24/*here.bits*/;
          hold >>>= op;
          bits -= op;
          op = (here >>> 16) & 0xff/*here.op*/;

          if (op & 16) {                      /* distance base */
            dist = here & 0xffff/*here.val*/;
            op &= 15;                       /* number of extra bits */
            if (bits < op) {
              hold += input[_in++] << bits;
              bits += 8;
              if (bits < op) {
                hold += input[_in++] << bits;
                bits += 8;
              }
            }
            dist += hold & ((1 << op) - 1);
//#ifdef INFLATE_STRICT
            if (dist > dmax) {
              strm.msg = 'invalid distance too far back';
              state.mode = BAD;
              break top;
            }
//#endif
            hold >>>= op;
            bits -= op;
            //Tracevv((stderr, "inflate:         distance %u\n", dist));
            op = _out - beg;                /* max distance in output */
            if (dist > op) {                /* see if copy from window */
              op = dist - op;               /* distance back in window */
              if (op > whave) {
                if (state.sane) {
                  strm.msg = 'invalid distance too far back';
                  state.mode = BAD;
                  break top;
                }

// (!) This block is disabled in zlib defaults,
// don't enable it for binary compatibility
//#ifdef INFLATE_ALLOW_INVALID_DISTANCE_TOOFAR_ARRR
//                if (len <= op - whave) {
//                  do {
//                    output[_out++] = 0;
//                  } while (--len);
//                  continue top;
//                }
//                len -= op - whave;
//                do {
//                  output[_out++] = 0;
//                } while (--op > whave);
//                if (op === 0) {
//                  from = _out - dist;
//                  do {
//                    output[_out++] = output[from++];
//                  } while (--len);
//                  continue top;
//                }
//#endif
              }
              from = 0; // window index
              from_source = s_window;
              if (wnext === 0) {           /* very common case */
                from += wsize - op;
                if (op < len) {         /* some from window */
                  len -= op;
                  do {
                    output[_out++] = s_window[from++];
                  } while (--op);
                  from = _out - dist;  /* rest from output */
                  from_source = output;
                }
              }
              else if (wnext < op) {      /* wrap around window */
                from += wsize + wnext - op;
                op -= wnext;
                if (op < len) {         /* some from end of window */
                  len -= op;
                  do {
                    output[_out++] = s_window[from++];
                  } while (--op);
                  from = 0;
                  if (wnext < len) {  /* some from start of window */
                    op = wnext;
                    len -= op;
                    do {
                      output[_out++] = s_window[from++];
                    } while (--op);
                    from = _out - dist;      /* rest from output */
                    from_source = output;
                  }
                }
              }
              else {                      /* contiguous in window */
                from += wnext - op;
                if (op < len) {         /* some from window */
                  len -= op;
                  do {
                    output[_out++] = s_window[from++];
                  } while (--op);
                  from = _out - dist;  /* rest from output */
                  from_source = output;
                }
              }
              while (len > 2) {
                output[_out++] = from_source[from++];
                output[_out++] = from_source[from++];
                output[_out++] = from_source[from++];
                len -= 3;
              }
              if (len) {
                output[_out++] = from_source[from++];
                if (len > 1) {
                  output[_out++] = from_source[from++];
                }
              }
            }
            else {
              from = _out - dist;          /* copy direct from output */
              do {                        /* minimum length is three */
                output[_out++] = output[from++];
                output[_out++] = output[from++];
                output[_out++] = output[from++];
                len -= 3;
              } while (len > 2);
              if (len) {
                output[_out++] = output[from++];
                if (len > 1) {
                  output[_out++] = output[from++];
                }
              }
            }
          }
          else if ((op & 64) === 0) {          /* 2nd level distance code */
            here = dcode[(here & 0xffff)/*here.val*/ + (hold & ((1 << op) - 1))];
            continue dodist;
          }
          else {
            strm.msg = 'invalid distance code';
            state.mode = BAD;
            break top;
          }

          break; // need to emulate goto via "continue"
        }
      }
      else if ((op & 64) === 0) {              /* 2nd level length code */
        here = lcode[(here & 0xffff)/*here.val*/ + (hold & ((1 << op) - 1))];
        continue dolen;
      }
      else if (op & 32) {                     /* end-of-block */
        //Tracevv((stderr, "inflate:         end of block\n"));
        state.mode = TYPE;
        break top;
      }
      else {
        strm.msg = 'invalid literal/length code';
        state.mode = BAD;
        break top;
      }

      break; // need to emulate goto via "continue"
    }
  } while (_in < last && _out < end);

  /* return unused bytes (on entry, bits < 8, so in won't go too far back) */
  len = bits >> 3;
  _in -= len;
  bits -= len << 3;
  hold &= (1 << bits) - 1;

  /* update state and return */
  strm.next_in = _in;
  strm.next_out = _out;
  strm.avail_in = (_in < last ? 5 + (last - _in) : 5 - (_in - last));
  strm.avail_out = (_out < end ? 257 + (end - _out) : 257 - (_out - end));
  state.hold = hold;
  state.bits = bits;
  return;
};

},{}],31:[function(require,module,exports){
'use strict';

// (C) 1995-2013 Jean-loup Gailly and Mark Adler
// (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
//
// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.
//
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:
//
// 1. The origin of this software must not be misrepresented; you must not
//   claim that you wrote the original software. If you use this software
//   in a product, an acknowledgment in the product documentation would be
//   appreciated but is not required.
// 2. Altered source versions must be plainly marked as such, and must not be
//   misrepresented as being the original software.
// 3. This notice may not be removed or altered from any source distribution.

var utils         = require('../utils/common');
var adler32       = require('./adler32');
var crc32         = require('./crc32');
var inflate_fast  = require('./inffast');
var inflate_table = require('./inftrees');

var CODES = 0;
var LENS = 1;
var DISTS = 2;

/* Public constants ==========================================================*/
/* ===========================================================================*/


/* Allowed flush values; see deflate() and inflate() below for details */
//var Z_NO_FLUSH      = 0;
//var Z_PARTIAL_FLUSH = 1;
//var Z_SYNC_FLUSH    = 2;
//var Z_FULL_FLUSH    = 3;
var Z_FINISH        = 4;
var Z_BLOCK         = 5;
var Z_TREES         = 6;


/* Return codes for the compression/decompression functions. Negative values
 * are errors, positive values are used for special but normal events.
 */
var Z_OK            = 0;
var Z_STREAM_END    = 1;
var Z_NEED_DICT     = 2;
//var Z_ERRNO         = -1;
var Z_STREAM_ERROR  = -2;
var Z_DATA_ERROR    = -3;
var Z_MEM_ERROR     = -4;
var Z_BUF_ERROR     = -5;
//var Z_VERSION_ERROR = -6;

/* The deflate compression method */
var Z_DEFLATED  = 8;


/* STATES ====================================================================*/
/* ===========================================================================*/


var    HEAD = 1;       /* i: waiting for magic header */
var    FLAGS = 2;      /* i: waiting for method and flags (gzip) */
var    TIME = 3;       /* i: waiting for modification time (gzip) */
var    OS = 4;         /* i: waiting for extra flags and operating system (gzip) */
var    EXLEN = 5;      /* i: waiting for extra length (gzip) */
var    EXTRA = 6;      /* i: waiting for extra bytes (gzip) */
var    NAME = 7;       /* i: waiting for end of file name (gzip) */
var    COMMENT = 8;    /* i: waiting for end of comment (gzip) */
var    HCRC = 9;       /* i: waiting for header crc (gzip) */
var    DICTID = 10;    /* i: waiting for dictionary check value */
var    DICT = 11;      /* waiting for inflateSetDictionary() call */
var        TYPE = 12;      /* i: waiting for type bits, including last-flag bit */
var        TYPEDO = 13;    /* i: same, but skip check to exit inflate on new block */
var        STORED = 14;    /* i: waiting for stored size (length and complement) */
var        COPY_ = 15;     /* i/o: same as COPY below, but only first time in */
var        COPY = 16;      /* i/o: waiting for input or output to copy stored block */
var        TABLE = 17;     /* i: waiting for dynamic block table lengths */
var        LENLENS = 18;   /* i: waiting for code length code lengths */
var        CODELENS = 19;  /* i: waiting for length/lit and distance code lengths */
var            LEN_ = 20;      /* i: same as LEN below, but only first time in */
var            LEN = 21;       /* i: waiting for length/lit/eob code */
var            LENEXT = 22;    /* i: waiting for length extra bits */
var            DIST = 23;      /* i: waiting for distance code */
var            DISTEXT = 24;   /* i: waiting for distance extra bits */
var            MATCH = 25;     /* o: waiting for output space to copy string */
var            LIT = 26;       /* o: waiting for output space to write literal */
var    CHECK = 27;     /* i: waiting for 32-bit check value */
var    LENGTH = 28;    /* i: waiting for 32-bit length (gzip) */
var    DONE = 29;      /* finished check, done -- remain here until reset */
var    BAD = 30;       /* got a data error -- remain here until reset */
var    MEM = 31;       /* got an inflate() memory error -- remain here until reset */
var    SYNC = 32;      /* looking for synchronization bytes to restart inflate() */

/* ===========================================================================*/



var ENOUGH_LENS = 852;
var ENOUGH_DISTS = 592;
//var ENOUGH =  (ENOUGH_LENS+ENOUGH_DISTS);

var MAX_WBITS = 15;
/* 32K LZ77 window */
var DEF_WBITS = MAX_WBITS;


function zswap32(q) {
  return  (((q >>> 24) & 0xff) +
          ((q >>> 8) & 0xff00) +
          ((q & 0xff00) << 8) +
          ((q & 0xff) << 24));
}


function InflateState() {
  this.mode = 0;             /* current inflate mode */
  this.last = false;          /* true if processing last block */
  this.wrap = 0;              /* bit 0 true for zlib, bit 1 true for gzip */
  this.havedict = false;      /* true if dictionary provided */
  this.flags = 0;             /* gzip header method and flags (0 if zlib) */
  this.dmax = 0;              /* zlib header max distance (INFLATE_STRICT) */
  this.check = 0;             /* protected copy of check value */
  this.total = 0;             /* protected copy of output count */
  // TODO: may be {}
  this.head = null;           /* where to save gzip header information */

  /* sliding window */
  this.wbits = 0;             /* log base 2 of requested window size */
  this.wsize = 0;             /* window size or zero if not using window */
  this.whave = 0;             /* valid bytes in the window */
  this.wnext = 0;             /* window write index */
  this.window = null;         /* allocated sliding window, if needed */

  /* bit accumulator */
  this.hold = 0;              /* input bit accumulator */
  this.bits = 0;              /* number of bits in "in" */

  /* for string and stored block copying */
  this.length = 0;            /* literal or length of data to copy */
  this.offset = 0;            /* distance back to copy string from */

  /* for table and code decoding */
  this.extra = 0;             /* extra bits needed */

  /* fixed and dynamic code tables */
  this.lencode = null;          /* starting table for length/literal codes */
  this.distcode = null;         /* starting table for distance codes */
  this.lenbits = 0;           /* index bits for lencode */
  this.distbits = 0;          /* index bits for distcode */

  /* dynamic table building */
  this.ncode = 0;             /* number of code length code lengths */
  this.nlen = 0;              /* number of length code lengths */
  this.ndist = 0;             /* number of distance code lengths */
  this.have = 0;              /* number of code lengths in lens[] */
  this.next = null;              /* next available space in codes[] */

  this.lens = new utils.Buf16(320); /* temporary storage for code lengths */
  this.work = new utils.Buf16(288); /* work area for code table building */

  /*
   because we don't have pointers in js, we use lencode and distcode directly
   as buffers so we don't need codes
  */
  //this.codes = new utils.Buf32(ENOUGH);       /* space for code tables */
  this.lendyn = null;              /* dynamic table for length/literal codes (JS specific) */
  this.distdyn = null;             /* dynamic table for distance codes (JS specific) */
  this.sane = 0;                   /* if false, allow invalid distance too far */
  this.back = 0;                   /* bits back of last unprocessed length/lit */
  this.was = 0;                    /* initial length of match */
}

function inflateResetKeep(strm) {
  var state;

  if (!strm || !strm.state) { return Z_STREAM_ERROR; }
  state = strm.state;
  strm.total_in = strm.total_out = state.total = 0;
  strm.msg = ''; /*Z_NULL*/
  if (state.wrap) {       /* to support ill-conceived Java test suite */
    strm.adler = state.wrap & 1;
  }
  state.mode = HEAD;
  state.last = 0;
  state.havedict = 0;
  state.dmax = 32768;
  state.head = null/*Z_NULL*/;
  state.hold = 0;
  state.bits = 0;
  //state.lencode = state.distcode = state.next = state.codes;
  state.lencode = state.lendyn = new utils.Buf32(ENOUGH_LENS);
  state.distcode = state.distdyn = new utils.Buf32(ENOUGH_DISTS);

  state.sane = 1;
  state.back = -1;
  //Tracev((stderr, "inflate: reset\n"));
  return Z_OK;
}

function inflateReset(strm) {
  var state;

  if (!strm || !strm.state) { return Z_STREAM_ERROR; }
  state = strm.state;
  state.wsize = 0;
  state.whave = 0;
  state.wnext = 0;
  return inflateResetKeep(strm);

}

function inflateReset2(strm, windowBits) {
  var wrap;
  var state;

  /* get the state */
  if (!strm || !strm.state) { return Z_STREAM_ERROR; }
  state = strm.state;

  /* extract wrap request from windowBits parameter */
  if (windowBits < 0) {
    wrap = 0;
    windowBits = -windowBits;
  }
  else {
    wrap = (windowBits >> 4) + 1;
    if (windowBits < 48) {
      windowBits &= 15;
    }
  }

  /* set number of window bits, free window if different */
  if (windowBits && (windowBits < 8 || windowBits > 15)) {
    return Z_STREAM_ERROR;
  }
  if (state.window !== null && state.wbits !== windowBits) {
    state.window = null;
  }

  /* update state and reset the rest of it */
  state.wrap = wrap;
  state.wbits = windowBits;
  return inflateReset(strm);
}

function inflateInit2(strm, windowBits) {
  var ret;
  var state;

  if (!strm) { return Z_STREAM_ERROR; }
  //strm.msg = Z_NULL;                 /* in case we return an error */

  state = new InflateState();

  //if (state === Z_NULL) return Z_MEM_ERROR;
  //Tracev((stderr, "inflate: allocated\n"));
  strm.state = state;
  state.window = null/*Z_NULL*/;
  ret = inflateReset2(strm, windowBits);
  if (ret !== Z_OK) {
    strm.state = null/*Z_NULL*/;
  }
  return ret;
}

function inflateInit(strm) {
  return inflateInit2(strm, DEF_WBITS);
}


/*
 Return state with length and distance decoding tables and index sizes set to
 fixed code decoding.  Normally this returns fixed tables from inffixed.h.
 If BUILDFIXED is defined, then instead this routine builds the tables the
 first time it's called, and returns those tables the first time and
 thereafter.  This reduces the size of the code by about 2K bytes, in
 exchange for a little execution time.  However, BUILDFIXED should not be
 used for threaded applications, since the rewriting of the tables and virgin
 may not be thread-safe.
 */
var virgin = true;

var lenfix, distfix; // We have no pointers in JS, so keep tables separate

function fixedtables(state) {
  /* build fixed huffman tables if first call (may not be thread safe) */
  if (virgin) {
    var sym;

    lenfix = new utils.Buf32(512);
    distfix = new utils.Buf32(32);

    /* literal/length table */
    sym = 0;
    while (sym < 144) { state.lens[sym++] = 8; }
    while (sym < 256) { state.lens[sym++] = 9; }
    while (sym < 280) { state.lens[sym++] = 7; }
    while (sym < 288) { state.lens[sym++] = 8; }

    inflate_table(LENS,  state.lens, 0, 288, lenfix,   0, state.work, { bits: 9 });

    /* distance table */
    sym = 0;
    while (sym < 32) { state.lens[sym++] = 5; }

    inflate_table(DISTS, state.lens, 0, 32,   distfix, 0, state.work, { bits: 5 });

    /* do this just once */
    virgin = false;
  }

  state.lencode = lenfix;
  state.lenbits = 9;
  state.distcode = distfix;
  state.distbits = 5;
}


/*
 Update the window with the last wsize (normally 32K) bytes written before
 returning.  If window does not exist yet, create it.  This is only called
 when a window is already in use, or when output has been written during this
 inflate call, but the end of the deflate stream has not been reached yet.
 It is also called to create a window for dictionary data when a dictionary
 is loaded.

 Providing output buffers larger than 32K to inflate() should provide a speed
 advantage, since only the last 32K of output is copied to the sliding window
 upon return from inflate(), and since all distances after the first 32K of
 output will fall in the output data, making match copies simpler and faster.
 The advantage may be dependent on the size of the processor's data caches.
 */
function updatewindow(strm, src, end, copy) {
  var dist;
  var state = strm.state;

  /* if it hasn't been done already, allocate space for the window */
  if (state.window === null) {
    state.wsize = 1 << state.wbits;
    state.wnext = 0;
    state.whave = 0;

    state.window = new utils.Buf8(state.wsize);
  }

  /* copy state->wsize or less output bytes into the circular window */
  if (copy >= state.wsize) {
    utils.arraySet(state.window, src, end - state.wsize, state.wsize, 0);
    state.wnext = 0;
    state.whave = state.wsize;
  }
  else {
    dist = state.wsize - state.wnext;
    if (dist > copy) {
      dist = copy;
    }
    //zmemcpy(state->window + state->wnext, end - copy, dist);
    utils.arraySet(state.window, src, end - copy, dist, state.wnext);
    copy -= dist;
    if (copy) {
      //zmemcpy(state->window, end - copy, copy);
      utils.arraySet(state.window, src, end - copy, copy, 0);
      state.wnext = copy;
      state.whave = state.wsize;
    }
    else {
      state.wnext += dist;
      if (state.wnext === state.wsize) { state.wnext = 0; }
      if (state.whave < state.wsize) { state.whave += dist; }
    }
  }
  return 0;
}

function inflate(strm, flush) {
  var state;
  var input, output;          // input/output buffers
  var next;                   /* next input INDEX */
  var put;                    /* next output INDEX */
  var have, left;             /* available input and output */
  var hold;                   /* bit buffer */
  var bits;                   /* bits in bit buffer */
  var _in, _out;              /* save starting available input and output */
  var copy;                   /* number of stored or match bytes to copy */
  var from;                   /* where to copy match bytes from */
  var from_source;
  var here = 0;               /* current decoding table entry */
  var here_bits, here_op, here_val; // paked "here" denormalized (JS specific)
  //var last;                   /* parent table entry */
  var last_bits, last_op, last_val; // paked "last" denormalized (JS specific)
  var len;                    /* length to copy for repeats, bits to drop */
  var ret;                    /* return code */
  var hbuf = new utils.Buf8(4);    /* buffer for gzip header crc calculation */
  var opts;

  var n; // temporary var for NEED_BITS

  var order = /* permutation of code lengths */
    [ 16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15 ];


  if (!strm || !strm.state || !strm.output ||
      (!strm.input && strm.avail_in !== 0)) {
    return Z_STREAM_ERROR;
  }

  state = strm.state;
  if (state.mode === TYPE) { state.mode = TYPEDO; }    /* skip check */


  //--- LOAD() ---
  put = strm.next_out;
  output = strm.output;
  left = strm.avail_out;
  next = strm.next_in;
  input = strm.input;
  have = strm.avail_in;
  hold = state.hold;
  bits = state.bits;
  //---

  _in = have;
  _out = left;
  ret = Z_OK;

  inf_leave: // goto emulation
  for (;;) {
    switch (state.mode) {
      case HEAD:
        if (state.wrap === 0) {
          state.mode = TYPEDO;
          break;
        }
        //=== NEEDBITS(16);
        while (bits < 16) {
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        if ((state.wrap & 2) && hold === 0x8b1f) {  /* gzip header */
          state.check = 0/*crc32(0L, Z_NULL, 0)*/;
          //=== CRC2(state.check, hold);
          hbuf[0] = hold & 0xff;
          hbuf[1] = (hold >>> 8) & 0xff;
          state.check = crc32(state.check, hbuf, 2, 0);
          //===//

          //=== INITBITS();
          hold = 0;
          bits = 0;
          //===//
          state.mode = FLAGS;
          break;
        }
        state.flags = 0;           /* expect zlib header */
        if (state.head) {
          state.head.done = false;
        }
        if (!(state.wrap & 1) ||   /* check if zlib header allowed */
          (((hold & 0xff)/*BITS(8)*/ << 8) + (hold >> 8)) % 31) {
          strm.msg = 'incorrect header check';
          state.mode = BAD;
          break;
        }
        if ((hold & 0x0f)/*BITS(4)*/ !== Z_DEFLATED) {
          strm.msg = 'unknown compression method';
          state.mode = BAD;
          break;
        }
        //--- DROPBITS(4) ---//
        hold >>>= 4;
        bits -= 4;
        //---//
        len = (hold & 0x0f)/*BITS(4)*/ + 8;
        if (state.wbits === 0) {
          state.wbits = len;
        }
        else if (len > state.wbits) {
          strm.msg = 'invalid window size';
          state.mode = BAD;
          break;
        }
        state.dmax = 1 << len;
        //Tracev((stderr, "inflate:   zlib header ok\n"));
        strm.adler = state.check = 1/*adler32(0L, Z_NULL, 0)*/;
        state.mode = hold & 0x200 ? DICTID : TYPE;
        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
        break;
      case FLAGS:
        //=== NEEDBITS(16); */
        while (bits < 16) {
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        state.flags = hold;
        if ((state.flags & 0xff) !== Z_DEFLATED) {
          strm.msg = 'unknown compression method';
          state.mode = BAD;
          break;
        }
        if (state.flags & 0xe000) {
          strm.msg = 'unknown header flags set';
          state.mode = BAD;
          break;
        }
        if (state.head) {
          state.head.text = ((hold >> 8) & 1);
        }
        if (state.flags & 0x0200) {
          //=== CRC2(state.check, hold);
          hbuf[0] = hold & 0xff;
          hbuf[1] = (hold >>> 8) & 0xff;
          state.check = crc32(state.check, hbuf, 2, 0);
          //===//
        }
        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
        state.mode = TIME;
        /* falls through */
      case TIME:
        //=== NEEDBITS(32); */
        while (bits < 32) {
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        if (state.head) {
          state.head.time = hold;
        }
        if (state.flags & 0x0200) {
          //=== CRC4(state.check, hold)
          hbuf[0] = hold & 0xff;
          hbuf[1] = (hold >>> 8) & 0xff;
          hbuf[2] = (hold >>> 16) & 0xff;
          hbuf[3] = (hold >>> 24) & 0xff;
          state.check = crc32(state.check, hbuf, 4, 0);
          //===
        }
        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
        state.mode = OS;
        /* falls through */
      case OS:
        //=== NEEDBITS(16); */
        while (bits < 16) {
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        if (state.head) {
          state.head.xflags = (hold & 0xff);
          state.head.os = (hold >> 8);
        }
        if (state.flags & 0x0200) {
          //=== CRC2(state.check, hold);
          hbuf[0] = hold & 0xff;
          hbuf[1] = (hold >>> 8) & 0xff;
          state.check = crc32(state.check, hbuf, 2, 0);
          //===//
        }
        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
        state.mode = EXLEN;
        /* falls through */
      case EXLEN:
        if (state.flags & 0x0400) {
          //=== NEEDBITS(16); */
          while (bits < 16) {
            if (have === 0) { break inf_leave; }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          //===//
          state.length = hold;
          if (state.head) {
            state.head.extra_len = hold;
          }
          if (state.flags & 0x0200) {
            //=== CRC2(state.check, hold);
            hbuf[0] = hold & 0xff;
            hbuf[1] = (hold >>> 8) & 0xff;
            state.check = crc32(state.check, hbuf, 2, 0);
            //===//
          }
          //=== INITBITS();
          hold = 0;
          bits = 0;
          //===//
        }
        else if (state.head) {
          state.head.extra = null/*Z_NULL*/;
        }
        state.mode = EXTRA;
        /* falls through */
      case EXTRA:
        if (state.flags & 0x0400) {
          copy = state.length;
          if (copy > have) { copy = have; }
          if (copy) {
            if (state.head) {
              len = state.head.extra_len - state.length;
              if (!state.head.extra) {
                // Use untyped array for more convenient processing later
                state.head.extra = new Array(state.head.extra_len);
              }
              utils.arraySet(
                state.head.extra,
                input,
                next,
                // extra field is limited to 65536 bytes
                // - no need for additional size check
                copy,
                /*len + copy > state.head.extra_max - len ? state.head.extra_max : copy,*/
                len
              );
              //zmemcpy(state.head.extra + len, next,
              //        len + copy > state.head.extra_max ?
              //        state.head.extra_max - len : copy);
            }
            if (state.flags & 0x0200) {
              state.check = crc32(state.check, input, copy, next);
            }
            have -= copy;
            next += copy;
            state.length -= copy;
          }
          if (state.length) { break inf_leave; }
        }
        state.length = 0;
        state.mode = NAME;
        /* falls through */
      case NAME:
        if (state.flags & 0x0800) {
          if (have === 0) { break inf_leave; }
          copy = 0;
          do {
            // TODO: 2 or 1 bytes?
            len = input[next + copy++];
            /* use constant limit because in js we should not preallocate memory */
            if (state.head && len &&
                (state.length < 65536 /*state.head.name_max*/)) {
              state.head.name += String.fromCharCode(len);
            }
          } while (len && copy < have);

          if (state.flags & 0x0200) {
            state.check = crc32(state.check, input, copy, next);
          }
          have -= copy;
          next += copy;
          if (len) { break inf_leave; }
        }
        else if (state.head) {
          state.head.name = null;
        }
        state.length = 0;
        state.mode = COMMENT;
        /* falls through */
      case COMMENT:
        if (state.flags & 0x1000) {
          if (have === 0) { break inf_leave; }
          copy = 0;
          do {
            len = input[next + copy++];
            /* use constant limit because in js we should not preallocate memory */
            if (state.head && len &&
                (state.length < 65536 /*state.head.comm_max*/)) {
              state.head.comment += String.fromCharCode(len);
            }
          } while (len && copy < have);
          if (state.flags & 0x0200) {
            state.check = crc32(state.check, input, copy, next);
          }
          have -= copy;
          next += copy;
          if (len) { break inf_leave; }
        }
        else if (state.head) {
          state.head.comment = null;
        }
        state.mode = HCRC;
        /* falls through */
      case HCRC:
        if (state.flags & 0x0200) {
          //=== NEEDBITS(16); */
          while (bits < 16) {
            if (have === 0) { break inf_leave; }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          //===//
          if (hold !== (state.check & 0xffff)) {
            strm.msg = 'header crc mismatch';
            state.mode = BAD;
            break;
          }
          //=== INITBITS();
          hold = 0;
          bits = 0;
          //===//
        }
        if (state.head) {
          state.head.hcrc = ((state.flags >> 9) & 1);
          state.head.done = true;
        }
        strm.adler = state.check = 0;
        state.mode = TYPE;
        break;
      case DICTID:
        //=== NEEDBITS(32); */
        while (bits < 32) {
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        strm.adler = state.check = zswap32(hold);
        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
        state.mode = DICT;
        /* falls through */
      case DICT:
        if (state.havedict === 0) {
          //--- RESTORE() ---
          strm.next_out = put;
          strm.avail_out = left;
          strm.next_in = next;
          strm.avail_in = have;
          state.hold = hold;
          state.bits = bits;
          //---
          return Z_NEED_DICT;
        }
        strm.adler = state.check = 1/*adler32(0L, Z_NULL, 0)*/;
        state.mode = TYPE;
        /* falls through */
      case TYPE:
        if (flush === Z_BLOCK || flush === Z_TREES) { break inf_leave; }
        /* falls through */
      case TYPEDO:
        if (state.last) {
          //--- BYTEBITS() ---//
          hold >>>= bits & 7;
          bits -= bits & 7;
          //---//
          state.mode = CHECK;
          break;
        }
        //=== NEEDBITS(3); */
        while (bits < 3) {
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        state.last = (hold & 0x01)/*BITS(1)*/;
        //--- DROPBITS(1) ---//
        hold >>>= 1;
        bits -= 1;
        //---//

        switch ((hold & 0x03)/*BITS(2)*/) {
          case 0:                             /* stored block */
            //Tracev((stderr, "inflate:     stored block%s\n",
            //        state.last ? " (last)" : ""));
            state.mode = STORED;
            break;
          case 1:                             /* fixed block */
            fixedtables(state);
            //Tracev((stderr, "inflate:     fixed codes block%s\n",
            //        state.last ? " (last)" : ""));
            state.mode = LEN_;             /* decode codes */
            if (flush === Z_TREES) {
              //--- DROPBITS(2) ---//
              hold >>>= 2;
              bits -= 2;
              //---//
              break inf_leave;
            }
            break;
          case 2:                             /* dynamic block */
            //Tracev((stderr, "inflate:     dynamic codes block%s\n",
            //        state.last ? " (last)" : ""));
            state.mode = TABLE;
            break;
          case 3:
            strm.msg = 'invalid block type';
            state.mode = BAD;
        }
        //--- DROPBITS(2) ---//
        hold >>>= 2;
        bits -= 2;
        //---//
        break;
      case STORED:
        //--- BYTEBITS() ---// /* go to byte boundary */
        hold >>>= bits & 7;
        bits -= bits & 7;
        //---//
        //=== NEEDBITS(32); */
        while (bits < 32) {
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        if ((hold & 0xffff) !== ((hold >>> 16) ^ 0xffff)) {
          strm.msg = 'invalid stored block lengths';
          state.mode = BAD;
          break;
        }
        state.length = hold & 0xffff;
        //Tracev((stderr, "inflate:       stored length %u\n",
        //        state.length));
        //=== INITBITS();
        hold = 0;
        bits = 0;
        //===//
        state.mode = COPY_;
        if (flush === Z_TREES) { break inf_leave; }
        /* falls through */
      case COPY_:
        state.mode = COPY;
        /* falls through */
      case COPY:
        copy = state.length;
        if (copy) {
          if (copy > have) { copy = have; }
          if (copy > left) { copy = left; }
          if (copy === 0) { break inf_leave; }
          //--- zmemcpy(put, next, copy); ---
          utils.arraySet(output, input, next, copy, put);
          //---//
          have -= copy;
          next += copy;
          left -= copy;
          put += copy;
          state.length -= copy;
          break;
        }
        //Tracev((stderr, "inflate:       stored end\n"));
        state.mode = TYPE;
        break;
      case TABLE:
        //=== NEEDBITS(14); */
        while (bits < 14) {
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        //===//
        state.nlen = (hold & 0x1f)/*BITS(5)*/ + 257;
        //--- DROPBITS(5) ---//
        hold >>>= 5;
        bits -= 5;
        //---//
        state.ndist = (hold & 0x1f)/*BITS(5)*/ + 1;
        //--- DROPBITS(5) ---//
        hold >>>= 5;
        bits -= 5;
        //---//
        state.ncode = (hold & 0x0f)/*BITS(4)*/ + 4;
        //--- DROPBITS(4) ---//
        hold >>>= 4;
        bits -= 4;
        //---//
//#ifndef PKZIP_BUG_WORKAROUND
        if (state.nlen > 286 || state.ndist > 30) {
          strm.msg = 'too many length or distance symbols';
          state.mode = BAD;
          break;
        }
//#endif
        //Tracev((stderr, "inflate:       table sizes ok\n"));
        state.have = 0;
        state.mode = LENLENS;
        /* falls through */
      case LENLENS:
        while (state.have < state.ncode) {
          //=== NEEDBITS(3);
          while (bits < 3) {
            if (have === 0) { break inf_leave; }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          //===//
          state.lens[order[state.have++]] = (hold & 0x07);//BITS(3);
          //--- DROPBITS(3) ---//
          hold >>>= 3;
          bits -= 3;
          //---//
        }
        while (state.have < 19) {
          state.lens[order[state.have++]] = 0;
        }
        // We have separate tables & no pointers. 2 commented lines below not needed.
        //state.next = state.codes;
        //state.lencode = state.next;
        // Switch to use dynamic table
        state.lencode = state.lendyn;
        state.lenbits = 7;

        opts = { bits: state.lenbits };
        ret = inflate_table(CODES, state.lens, 0, 19, state.lencode, 0, state.work, opts);
        state.lenbits = opts.bits;

        if (ret) {
          strm.msg = 'invalid code lengths set';
          state.mode = BAD;
          break;
        }
        //Tracev((stderr, "inflate:       code lengths ok\n"));
        state.have = 0;
        state.mode = CODELENS;
        /* falls through */
      case CODELENS:
        while (state.have < state.nlen + state.ndist) {
          for (;;) {
            here = state.lencode[hold & ((1 << state.lenbits) - 1)];/*BITS(state.lenbits)*/
            here_bits = here >>> 24;
            here_op = (here >>> 16) & 0xff;
            here_val = here & 0xffff;

            if ((here_bits) <= bits) { break; }
            //--- PULLBYTE() ---//
            if (have === 0) { break inf_leave; }
            have--;
            hold += input[next++] << bits;
            bits += 8;
            //---//
          }
          if (here_val < 16) {
            //--- DROPBITS(here.bits) ---//
            hold >>>= here_bits;
            bits -= here_bits;
            //---//
            state.lens[state.have++] = here_val;
          }
          else {
            if (here_val === 16) {
              //=== NEEDBITS(here.bits + 2);
              n = here_bits + 2;
              while (bits < n) {
                if (have === 0) { break inf_leave; }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              //===//
              //--- DROPBITS(here.bits) ---//
              hold >>>= here_bits;
              bits -= here_bits;
              //---//
              if (state.have === 0) {
                strm.msg = 'invalid bit length repeat';
                state.mode = BAD;
                break;
              }
              len = state.lens[state.have - 1];
              copy = 3 + (hold & 0x03);//BITS(2);
              //--- DROPBITS(2) ---//
              hold >>>= 2;
              bits -= 2;
              //---//
            }
            else if (here_val === 17) {
              //=== NEEDBITS(here.bits + 3);
              n = here_bits + 3;
              while (bits < n) {
                if (have === 0) { break inf_leave; }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              //===//
              //--- DROPBITS(here.bits) ---//
              hold >>>= here_bits;
              bits -= here_bits;
              //---//
              len = 0;
              copy = 3 + (hold & 0x07);//BITS(3);
              //--- DROPBITS(3) ---//
              hold >>>= 3;
              bits -= 3;
              //---//
            }
            else {
              //=== NEEDBITS(here.bits + 7);
              n = here_bits + 7;
              while (bits < n) {
                if (have === 0) { break inf_leave; }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              //===//
              //--- DROPBITS(here.bits) ---//
              hold >>>= here_bits;
              bits -= here_bits;
              //---//
              len = 0;
              copy = 11 + (hold & 0x7f);//BITS(7);
              //--- DROPBITS(7) ---//
              hold >>>= 7;
              bits -= 7;
              //---//
            }
            if (state.have + copy > state.nlen + state.ndist) {
              strm.msg = 'invalid bit length repeat';
              state.mode = BAD;
              break;
            }
            while (copy--) {
              state.lens[state.have++] = len;
            }
          }
        }

        /* handle error breaks in while */
        if (state.mode === BAD) { break; }

        /* check for end-of-block code (better have one) */
        if (state.lens[256] === 0) {
          strm.msg = 'invalid code -- missing end-of-block';
          state.mode = BAD;
          break;
        }

        /* build code tables -- note: do not change the lenbits or distbits
           values here (9 and 6) without reading the comments in inftrees.h
           concerning the ENOUGH constants, which depend on those values */
        state.lenbits = 9;

        opts = { bits: state.lenbits };
        ret = inflate_table(LENS, state.lens, 0, state.nlen, state.lencode, 0, state.work, opts);
        // We have separate tables & no pointers. 2 commented lines below not needed.
        // state.next_index = opts.table_index;
        state.lenbits = opts.bits;
        // state.lencode = state.next;

        if (ret) {
          strm.msg = 'invalid literal/lengths set';
          state.mode = BAD;
          break;
        }

        state.distbits = 6;
        //state.distcode.copy(state.codes);
        // Switch to use dynamic table
        state.distcode = state.distdyn;
        opts = { bits: state.distbits };
        ret = inflate_table(DISTS, state.lens, state.nlen, state.ndist, state.distcode, 0, state.work, opts);
        // We have separate tables & no pointers. 2 commented lines below not needed.
        // state.next_index = opts.table_index;
        state.distbits = opts.bits;
        // state.distcode = state.next;

        if (ret) {
          strm.msg = 'invalid distances set';
          state.mode = BAD;
          break;
        }
        //Tracev((stderr, 'inflate:       codes ok\n'));
        state.mode = LEN_;
        if (flush === Z_TREES) { break inf_leave; }
        /* falls through */
      case LEN_:
        state.mode = LEN;
        /* falls through */
      case LEN:
        if (have >= 6 && left >= 258) {
          //--- RESTORE() ---
          strm.next_out = put;
          strm.avail_out = left;
          strm.next_in = next;
          strm.avail_in = have;
          state.hold = hold;
          state.bits = bits;
          //---
          inflate_fast(strm, _out);
          //--- LOAD() ---
          put = strm.next_out;
          output = strm.output;
          left = strm.avail_out;
          next = strm.next_in;
          input = strm.input;
          have = strm.avail_in;
          hold = state.hold;
          bits = state.bits;
          //---

          if (state.mode === TYPE) {
            state.back = -1;
          }
          break;
        }
        state.back = 0;
        for (;;) {
          here = state.lencode[hold & ((1 << state.lenbits) - 1)];  /*BITS(state.lenbits)*/
          here_bits = here >>> 24;
          here_op = (here >>> 16) & 0xff;
          here_val = here & 0xffff;

          if (here_bits <= bits) { break; }
          //--- PULLBYTE() ---//
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
          //---//
        }
        if (here_op && (here_op & 0xf0) === 0) {
          last_bits = here_bits;
          last_op = here_op;
          last_val = here_val;
          for (;;) {
            here = state.lencode[last_val +
                    ((hold & ((1 << (last_bits + last_op)) - 1))/*BITS(last.bits + last.op)*/ >> last_bits)];
            here_bits = here >>> 24;
            here_op = (here >>> 16) & 0xff;
            here_val = here & 0xffff;

            if ((last_bits + here_bits) <= bits) { break; }
            //--- PULLBYTE() ---//
            if (have === 0) { break inf_leave; }
            have--;
            hold += input[next++] << bits;
            bits += 8;
            //---//
          }
          //--- DROPBITS(last.bits) ---//
          hold >>>= last_bits;
          bits -= last_bits;
          //---//
          state.back += last_bits;
        }
        //--- DROPBITS(here.bits) ---//
        hold >>>= here_bits;
        bits -= here_bits;
        //---//
        state.back += here_bits;
        state.length = here_val;
        if (here_op === 0) {
          //Tracevv((stderr, here.val >= 0x20 && here.val < 0x7f ?
          //        "inflate:         literal '%c'\n" :
          //        "inflate:         literal 0x%02x\n", here.val));
          state.mode = LIT;
          break;
        }
        if (here_op & 32) {
          //Tracevv((stderr, "inflate:         end of block\n"));
          state.back = -1;
          state.mode = TYPE;
          break;
        }
        if (here_op & 64) {
          strm.msg = 'invalid literal/length code';
          state.mode = BAD;
          break;
        }
        state.extra = here_op & 15;
        state.mode = LENEXT;
        /* falls through */
      case LENEXT:
        if (state.extra) {
          //=== NEEDBITS(state.extra);
          n = state.extra;
          while (bits < n) {
            if (have === 0) { break inf_leave; }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          //===//
          state.length += hold & ((1 << state.extra) - 1)/*BITS(state.extra)*/;
          //--- DROPBITS(state.extra) ---//
          hold >>>= state.extra;
          bits -= state.extra;
          //---//
          state.back += state.extra;
        }
        //Tracevv((stderr, "inflate:         length %u\n", state.length));
        state.was = state.length;
        state.mode = DIST;
        /* falls through */
      case DIST:
        for (;;) {
          here = state.distcode[hold & ((1 << state.distbits) - 1)];/*BITS(state.distbits)*/
          here_bits = here >>> 24;
          here_op = (here >>> 16) & 0xff;
          here_val = here & 0xffff;

          if ((here_bits) <= bits) { break; }
          //--- PULLBYTE() ---//
          if (have === 0) { break inf_leave; }
          have--;
          hold += input[next++] << bits;
          bits += 8;
          //---//
        }
        if ((here_op & 0xf0) === 0) {
          last_bits = here_bits;
          last_op = here_op;
          last_val = here_val;
          for (;;) {
            here = state.distcode[last_val +
                    ((hold & ((1 << (last_bits + last_op)) - 1))/*BITS(last.bits + last.op)*/ >> last_bits)];
            here_bits = here >>> 24;
            here_op = (here >>> 16) & 0xff;
            here_val = here & 0xffff;

            if ((last_bits + here_bits) <= bits) { break; }
            //--- PULLBYTE() ---//
            if (have === 0) { break inf_leave; }
            have--;
            hold += input[next++] << bits;
            bits += 8;
            //---//
          }
          //--- DROPBITS(last.bits) ---//
          hold >>>= last_bits;
          bits -= last_bits;
          //---//
          state.back += last_bits;
        }
        //--- DROPBITS(here.bits) ---//
        hold >>>= here_bits;
        bits -= here_bits;
        //---//
        state.back += here_bits;
        if (here_op & 64) {
          strm.msg = 'invalid distance code';
          state.mode = BAD;
          break;
        }
        state.offset = here_val;
        state.extra = (here_op) & 15;
        state.mode = DISTEXT;
        /* falls through */
      case DISTEXT:
        if (state.extra) {
          //=== NEEDBITS(state.extra);
          n = state.extra;
          while (bits < n) {
            if (have === 0) { break inf_leave; }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          //===//
          state.offset += hold & ((1 << state.extra) - 1)/*BITS(state.extra)*/;
          //--- DROPBITS(state.extra) ---//
          hold >>>= state.extra;
          bits -= state.extra;
          //---//
          state.back += state.extra;
        }
//#ifdef INFLATE_STRICT
        if (state.offset > state.dmax) {
          strm.msg = 'invalid distance too far back';
          state.mode = BAD;
          break;
        }
//#endif
        //Tracevv((stderr, "inflate:         distance %u\n", state.offset));
        state.mode = MATCH;
        /* falls through */
      case MATCH:
        if (left === 0) { break inf_leave; }
        copy = _out - left;
        if (state.offset > copy) {         /* copy from window */
          copy = state.offset - copy;
          if (copy > state.whave) {
            if (state.sane) {
              strm.msg = 'invalid distance too far back';
              state.mode = BAD;
              break;
            }
// (!) This block is disabled in zlib defaults,
// don't enable it for binary compatibility
//#ifdef INFLATE_ALLOW_INVALID_DISTANCE_TOOFAR_ARRR
//          Trace((stderr, "inflate.c too far\n"));
//          copy -= state.whave;
//          if (copy > state.length) { copy = state.length; }
//          if (copy > left) { copy = left; }
//          left -= copy;
//          state.length -= copy;
//          do {
//            output[put++] = 0;
//          } while (--copy);
//          if (state.length === 0) { state.mode = LEN; }
//          break;
//#endif
          }
          if (copy > state.wnext) {
            copy -= state.wnext;
            from = state.wsize - copy;
          }
          else {
            from = state.wnext - copy;
          }
          if (copy > state.length) { copy = state.length; }
          from_source = state.window;
        }
        else {                              /* copy from output */
          from_source = output;
          from = put - state.offset;
          copy = state.length;
        }
        if (copy > left) { copy = left; }
        left -= copy;
        state.length -= copy;
        do {
          output[put++] = from_source[from++];
        } while (--copy);
        if (state.length === 0) { state.mode = LEN; }
        break;
      case LIT:
        if (left === 0) { break inf_leave; }
        output[put++] = state.length;
        left--;
        state.mode = LEN;
        break;
      case CHECK:
        if (state.wrap) {
          //=== NEEDBITS(32);
          while (bits < 32) {
            if (have === 0) { break inf_leave; }
            have--;
            // Use '|' instead of '+' to make sure that result is signed
            hold |= input[next++] << bits;
            bits += 8;
          }
          //===//
          _out -= left;
          strm.total_out += _out;
          state.total += _out;
          if (_out) {
            strm.adler = state.check =
                /*UPDATE(state.check, put - _out, _out);*/
                (state.flags ? crc32(state.check, output, _out, put - _out) : adler32(state.check, output, _out, put - _out));

          }
          _out = left;
          // NB: crc32 stored as signed 32-bit int, zswap32 returns signed too
          if ((state.flags ? hold : zswap32(hold)) !== state.check) {
            strm.msg = 'incorrect data check';
            state.mode = BAD;
            break;
          }
          //=== INITBITS();
          hold = 0;
          bits = 0;
          //===//
          //Tracev((stderr, "inflate:   check matches trailer\n"));
        }
        state.mode = LENGTH;
        /* falls through */
      case LENGTH:
        if (state.wrap && state.flags) {
          //=== NEEDBITS(32);
          while (bits < 32) {
            if (have === 0) { break inf_leave; }
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          //===//
          if (hold !== (state.total & 0xffffffff)) {
            strm.msg = 'incorrect length check';
            state.mode = BAD;
            break;
          }
          //=== INITBITS();
          hold = 0;
          bits = 0;
          //===//
          //Tracev((stderr, "inflate:   length matches trailer\n"));
        }
        state.mode = DONE;
        /* falls through */
      case DONE:
        ret = Z_STREAM_END;
        break inf_leave;
      case BAD:
        ret = Z_DATA_ERROR;
        break inf_leave;
      case MEM:
        return Z_MEM_ERROR;
      case SYNC:
        /* falls through */
      default:
        return Z_STREAM_ERROR;
    }
  }

  // inf_leave <- here is real place for "goto inf_leave", emulated via "break inf_leave"

  /*
     Return from inflate(), updating the total counts and the check value.
     If there was no progress during the inflate() call, return a buffer
     error.  Call updatewindow() to create and/or update the window state.
     Note: a memory error from inflate() is non-recoverable.
   */

  //--- RESTORE() ---
  strm.next_out = put;
  strm.avail_out = left;
  strm.next_in = next;
  strm.avail_in = have;
  state.hold = hold;
  state.bits = bits;
  //---

  if (state.wsize || (_out !== strm.avail_out && state.mode < BAD &&
                      (state.mode < CHECK || flush !== Z_FINISH))) {
    if (updatewindow(strm, strm.output, strm.next_out, _out - strm.avail_out)) {
      state.mode = MEM;
      return Z_MEM_ERROR;
    }
  }
  _in -= strm.avail_in;
  _out -= strm.avail_out;
  strm.total_in += _in;
  strm.total_out += _out;
  state.total += _out;
  if (state.wrap && _out) {
    strm.adler = state.check = /*UPDATE(state.check, strm.next_out - _out, _out);*/
      (state.flags ? crc32(state.check, output, _out, strm.next_out - _out) : adler32(state.check, output, _out, strm.next_out - _out));
  }
  strm.data_type = state.bits + (state.last ? 64 : 0) +
                    (state.mode === TYPE ? 128 : 0) +
                    (state.mode === LEN_ || state.mode === COPY_ ? 256 : 0);
  if (((_in === 0 && _out === 0) || flush === Z_FINISH) && ret === Z_OK) {
    ret = Z_BUF_ERROR;
  }
  return ret;
}

function inflateEnd(strm) {

  if (!strm || !strm.state /*|| strm->zfree == (free_func)0*/) {
    return Z_STREAM_ERROR;
  }

  var state = strm.state;
  if (state.window) {
    state.window = null;
  }
  strm.state = null;
  return Z_OK;
}

function inflateGetHeader(strm, head) {
  var state;

  /* check state */
  if (!strm || !strm.state) { return Z_STREAM_ERROR; }
  state = strm.state;
  if ((state.wrap & 2) === 0) { return Z_STREAM_ERROR; }

  /* save header structure */
  state.head = head;
  head.done = false;
  return Z_OK;
}

function inflateSetDictionary(strm, dictionary) {
  var dictLength = dictionary.length;

  var state;
  var dictid;
  var ret;

  /* check state */
  if (!strm /* == Z_NULL */ || !strm.state /* == Z_NULL */) { return Z_STREAM_ERROR; }
  state = strm.state;

  if (state.wrap !== 0 && state.mode !== DICT) {
    return Z_STREAM_ERROR;
  }

  /* check for correct dictionary identifier */
  if (state.mode === DICT) {
    dictid = 1; /* adler32(0, null, 0)*/
    /* dictid = adler32(dictid, dictionary, dictLength); */
    dictid = adler32(dictid, dictionary, dictLength, 0);
    if (dictid !== state.check) {
      return Z_DATA_ERROR;
    }
  }
  /* copy dictionary to window using updatewindow(), which will amend the
   existing dictionary if appropriate */
  ret = updatewindow(strm, dictionary, dictLength, dictLength);
  if (ret) {
    state.mode = MEM;
    return Z_MEM_ERROR;
  }
  state.havedict = 1;
  // Tracev((stderr, "inflate:   dictionary set\n"));
  return Z_OK;
}

exports.inflateReset = inflateReset;
exports.inflateReset2 = inflateReset2;
exports.inflateResetKeep = inflateResetKeep;
exports.inflateInit = inflateInit;
exports.inflateInit2 = inflateInit2;
exports.inflate = inflate;
exports.inflateEnd = inflateEnd;
exports.inflateGetHeader = inflateGetHeader;
exports.inflateSetDictionary = inflateSetDictionary;
exports.inflateInfo = 'pako inflate (from Nodeca project)';

/* Not implemented
exports.inflateCopy = inflateCopy;
exports.inflateGetDictionary = inflateGetDictionary;
exports.inflateMark = inflateMark;
exports.inflatePrime = inflatePrime;
exports.inflateSync = inflateSync;
exports.inflateSyncPoint = inflateSyncPoint;
exports.inflateUndermine = inflateUndermine;
*/

},{"../utils/common":25,"./adler32":26,"./crc32":28,"./inffast":30,"./inftrees":32}],32:[function(require,module,exports){
'use strict';

// (C) 1995-2013 Jean-loup Gailly and Mark Adler
// (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
//
// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.
//
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:
//
// 1. The origin of this software must not be misrepresented; you must not
//   claim that you wrote the original software. If you use this software
//   in a product, an acknowledgment in the product documentation would be
//   appreciated but is not required.
// 2. Altered source versions must be plainly marked as such, and must not be
//   misrepresented as being the original software.
// 3. This notice may not be removed or altered from any source distribution.

var utils = require('../utils/common');

var MAXBITS = 15;
var ENOUGH_LENS = 852;
var ENOUGH_DISTS = 592;
//var ENOUGH = (ENOUGH_LENS+ENOUGH_DISTS);

var CODES = 0;
var LENS = 1;
var DISTS = 2;

var lbase = [ /* Length codes 257..285 base */
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
  35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258, 0, 0
];

var lext = [ /* Length codes 257..285 extra */
  16, 16, 16, 16, 16, 16, 16, 16, 17, 17, 17, 17, 18, 18, 18, 18,
  19, 19, 19, 19, 20, 20, 20, 20, 21, 21, 21, 21, 16, 72, 78
];

var dbase = [ /* Distance codes 0..29 base */
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
  257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
  8193, 12289, 16385, 24577, 0, 0
];

var dext = [ /* Distance codes 0..29 extra */
  16, 16, 16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22,
  23, 23, 24, 24, 25, 25, 26, 26, 27, 27,
  28, 28, 29, 29, 64, 64
];

module.exports = function inflate_table(type, lens, lens_index, codes, table, table_index, work, opts)
{
  var bits = opts.bits;
      //here = opts.here; /* table entry for duplication */

  var len = 0;               /* a code's length in bits */
  var sym = 0;               /* index of code symbols */
  var min = 0, max = 0;          /* minimum and maximum code lengths */
  var root = 0;              /* number of index bits for root table */
  var curr = 0;              /* number of index bits for current table */
  var drop = 0;              /* code bits to drop for sub-table */
  var left = 0;                   /* number of prefix codes available */
  var used = 0;              /* code entries in table used */
  var huff = 0;              /* Huffman code */
  var incr;              /* for incrementing code, index */
  var fill;              /* index for replicating entries */
  var low;               /* low bits for current root entry */
  var mask;              /* mask for low root bits */
  var next;             /* next available space in table */
  var base = null;     /* base value table to use */
  var base_index = 0;
//  var shoextra;    /* extra bits table to use */
  var end;                    /* use base and extra for symbol > end */
  var count = new utils.Buf16(MAXBITS + 1); //[MAXBITS+1];    /* number of codes of each length */
  var offs = new utils.Buf16(MAXBITS + 1); //[MAXBITS+1];     /* offsets in table for each length */
  var extra = null;
  var extra_index = 0;

  var here_bits, here_op, here_val;

  /*
   Process a set of code lengths to create a canonical Huffman code.  The
   code lengths are lens[0..codes-1].  Each length corresponds to the
   symbols 0..codes-1.  The Huffman code is generated by first sorting the
   symbols by length from short to long, and retaining the symbol order
   for codes with equal lengths.  Then the code starts with all zero bits
   for the first code of the shortest length, and the codes are integer
   increments for the same length, and zeros are appended as the length
   increases.  For the deflate format, these bits are stored backwards
   from their more natural integer increment ordering, and so when the
   decoding tables are built in the large loop below, the integer codes
   are incremented backwards.

   This routine assumes, but does not check, that all of the entries in
   lens[] are in the range 0..MAXBITS.  The caller must assure this.
   1..MAXBITS is interpreted as that code length.  zero means that that
   symbol does not occur in this code.

   The codes are sorted by computing a count of codes for each length,
   creating from that a table of starting indices for each length in the
   sorted table, and then entering the symbols in order in the sorted
   table.  The sorted table is work[], with that space being provided by
   the caller.

   The length counts are used for other purposes as well, i.e. finding
   the minimum and maximum length codes, determining if there are any
   codes at all, checking for a valid set of lengths, and looking ahead
   at length counts to determine sub-table sizes when building the
   decoding tables.
   */

  /* accumulate lengths for codes (assumes lens[] all in 0..MAXBITS) */
  for (len = 0; len <= MAXBITS; len++) {
    count[len] = 0;
  }
  for (sym = 0; sym < codes; sym++) {
    count[lens[lens_index + sym]]++;
  }

  /* bound code lengths, force root to be within code lengths */
  root = bits;
  for (max = MAXBITS; max >= 1; max--) {
    if (count[max] !== 0) { break; }
  }
  if (root > max) {
    root = max;
  }
  if (max === 0) {                     /* no symbols to code at all */
    //table.op[opts.table_index] = 64;  //here.op = (var char)64;    /* invalid code marker */
    //table.bits[opts.table_index] = 1;   //here.bits = (var char)1;
    //table.val[opts.table_index++] = 0;   //here.val = (var short)0;
    table[table_index++] = (1 << 24) | (64 << 16) | 0;


    //table.op[opts.table_index] = 64;
    //table.bits[opts.table_index] = 1;
    //table.val[opts.table_index++] = 0;
    table[table_index++] = (1 << 24) | (64 << 16) | 0;

    opts.bits = 1;
    return 0;     /* no symbols, but wait for decoding to report error */
  }
  for (min = 1; min < max; min++) {
    if (count[min] !== 0) { break; }
  }
  if (root < min) {
    root = min;
  }

  /* check for an over-subscribed or incomplete set of lengths */
  left = 1;
  for (len = 1; len <= MAXBITS; len++) {
    left <<= 1;
    left -= count[len];
    if (left < 0) {
      return -1;
    }        /* over-subscribed */
  }
  if (left > 0 && (type === CODES || max !== 1)) {
    return -1;                      /* incomplete set */
  }

  /* generate offsets into symbol table for each length for sorting */
  offs[1] = 0;
  for (len = 1; len < MAXBITS; len++) {
    offs[len + 1] = offs[len] + count[len];
  }

  /* sort symbols by length, by symbol order within each length */
  for (sym = 0; sym < codes; sym++) {
    if (lens[lens_index + sym] !== 0) {
      work[offs[lens[lens_index + sym]]++] = sym;
    }
  }

  /*
   Create and fill in decoding tables.  In this loop, the table being
   filled is at next and has curr index bits.  The code being used is huff
   with length len.  That code is converted to an index by dropping drop
   bits off of the bottom.  For codes where len is less than drop + curr,
   those top drop + curr - len bits are incremented through all values to
   fill the table with replicated entries.

   root is the number of index bits for the root table.  When len exceeds
   root, sub-tables are created pointed to by the root entry with an index
   of the low root bits of huff.  This is saved in low to check for when a
   new sub-table should be started.  drop is zero when the root table is
   being filled, and drop is root when sub-tables are being filled.

   When a new sub-table is needed, it is necessary to look ahead in the
   code lengths to determine what size sub-table is needed.  The length
   counts are used for this, and so count[] is decremented as codes are
   entered in the tables.

   used keeps track of how many table entries have been allocated from the
   provided *table space.  It is checked for LENS and DIST tables against
   the constants ENOUGH_LENS and ENOUGH_DISTS to guard against changes in
   the initial root table size constants.  See the comments in inftrees.h
   for more information.

   sym increments through all symbols, and the loop terminates when
   all codes of length max, i.e. all codes, have been processed.  This
   routine permits incomplete codes, so another loop after this one fills
   in the rest of the decoding tables with invalid code markers.
   */

  /* set up for code type */
  // poor man optimization - use if-else instead of switch,
  // to avoid deopts in old v8
  if (type === CODES) {
    base = extra = work;    /* dummy value--not used */
    end = 19;

  } else if (type === LENS) {
    base = lbase;
    base_index -= 257;
    extra = lext;
    extra_index -= 257;
    end = 256;

  } else {                    /* DISTS */
    base = dbase;
    extra = dext;
    end = -1;
  }

  /* initialize opts for loop */
  huff = 0;                   /* starting code */
  sym = 0;                    /* starting code symbol */
  len = min;                  /* starting code length */
  next = table_index;              /* current table to fill in */
  curr = root;                /* current table index bits */
  drop = 0;                   /* current bits to drop from code for index */
  low = -1;                   /* trigger new sub-table when len > root */
  used = 1 << root;          /* use root table entries */
  mask = used - 1;            /* mask for comparing low */

  /* check available table space */
  if ((type === LENS && used > ENOUGH_LENS) ||
    (type === DISTS && used > ENOUGH_DISTS)) {
    return 1;
  }

  /* process all codes and make table entries */
  for (;;) {
    /* create table entry */
    here_bits = len - drop;
    if (work[sym] < end) {
      here_op = 0;
      here_val = work[sym];
    }
    else if (work[sym] > end) {
      here_op = extra[extra_index + work[sym]];
      here_val = base[base_index + work[sym]];
    }
    else {
      here_op = 32 + 64;         /* end of block */
      here_val = 0;
    }

    /* replicate for those indices with low len bits equal to huff */
    incr = 1 << (len - drop);
    fill = 1 << curr;
    min = fill;                 /* save offset to next table */
    do {
      fill -= incr;
      table[next + (huff >> drop) + fill] = (here_bits << 24) | (here_op << 16) | here_val |0;
    } while (fill !== 0);

    /* backwards increment the len-bit code huff */
    incr = 1 << (len - 1);
    while (huff & incr) {
      incr >>= 1;
    }
    if (incr !== 0) {
      huff &= incr - 1;
      huff += incr;
    } else {
      huff = 0;
    }

    /* go to next symbol, update count, len */
    sym++;
    if (--count[len] === 0) {
      if (len === max) { break; }
      len = lens[lens_index + work[sym]];
    }

    /* create new sub-table if needed */
    if (len > root && (huff & mask) !== low) {
      /* if first time, transition to sub-tables */
      if (drop === 0) {
        drop = root;
      }

      /* increment past last table */
      next += min;            /* here min is 1 << curr */

      /* determine length of next table */
      curr = len - drop;
      left = 1 << curr;
      while (curr + drop < max) {
        left -= count[curr + drop];
        if (left <= 0) { break; }
        curr++;
        left <<= 1;
      }

      /* check for enough space */
      used += 1 << curr;
      if ((type === LENS && used > ENOUGH_LENS) ||
        (type === DISTS && used > ENOUGH_DISTS)) {
        return 1;
      }

      /* point entry in root table to sub-table */
      low = huff & mask;
      /*table.op[low] = curr;
      table.bits[low] = root;
      table.val[low] = next - opts.table_index;*/
      table[low] = (root << 24) | (curr << 16) | (next - table_index) |0;
    }
  }

  /* fill in remaining table entry if code is incomplete (guaranteed to have
   at most one remaining entry, since if the code is incomplete, the
   maximum code length that was allowed to get this far is one bit) */
  if (huff !== 0) {
    //table.op[next + huff] = 64;            /* invalid code marker */
    //table.bits[next + huff] = len - drop;
    //table.val[next + huff] = 0;
    table[next + huff] = ((len - drop) << 24) | (64 << 16) |0;
  }

  /* set return parameters */
  //opts.table_index += used;
  opts.bits = root;
  return 0;
};

},{"../utils/common":25}],33:[function(require,module,exports){
'use strict';

// (C) 1995-2013 Jean-loup Gailly and Mark Adler
// (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
//
// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.
//
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:
//
// 1. The origin of this software must not be misrepresented; you must not
//   claim that you wrote the original software. If you use this software
//   in a product, an acknowledgment in the product documentation would be
//   appreciated but is not required.
// 2. Altered source versions must be plainly marked as such, and must not be
//   misrepresented as being the original software.
// 3. This notice may not be removed or altered from any source distribution.

module.exports = {
  2:      'need dictionary',     /* Z_NEED_DICT       2  */
  1:      'stream end',          /* Z_STREAM_END      1  */
  0:      '',                    /* Z_OK              0  */
  '-1':   'file error',          /* Z_ERRNO         (-1) */
  '-2':   'stream error',        /* Z_STREAM_ERROR  (-2) */
  '-3':   'data error',          /* Z_DATA_ERROR    (-3) */
  '-4':   'insufficient memory', /* Z_MEM_ERROR     (-4) */
  '-5':   'buffer error',        /* Z_BUF_ERROR     (-5) */
  '-6':   'incompatible version' /* Z_VERSION_ERROR (-6) */
};

},{}],34:[function(require,module,exports){
'use strict';

// (C) 1995-2013 Jean-loup Gailly and Mark Adler
// (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
//
// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.
//
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:
//
// 1. The origin of this software must not be misrepresented; you must not
//   claim that you wrote the original software. If you use this software
//   in a product, an acknowledgment in the product documentation would be
//   appreciated but is not required.
// 2. Altered source versions must be plainly marked as such, and must not be
//   misrepresented as being the original software.
// 3. This notice may not be removed or altered from any source distribution.

/* eslint-disable space-unary-ops */

var utils = require('../utils/common');

/* Public constants ==========================================================*/
/* ===========================================================================*/


//var Z_FILTERED          = 1;
//var Z_HUFFMAN_ONLY      = 2;
//var Z_RLE               = 3;
var Z_FIXED               = 4;
//var Z_DEFAULT_STRATEGY  = 0;

/* Possible values of the data_type field (though see inflate()) */
var Z_BINARY              = 0;
var Z_TEXT                = 1;
//var Z_ASCII             = 1; // = Z_TEXT
var Z_UNKNOWN             = 2;

/*============================================================================*/


function zero(buf) { var len = buf.length; while (--len >= 0) { buf[len] = 0; } }

// From zutil.h

var STORED_BLOCK = 0;
var STATIC_TREES = 1;
var DYN_TREES    = 2;
/* The three kinds of block type */

var MIN_MATCH    = 3;
var MAX_MATCH    = 258;
/* The minimum and maximum match lengths */

// From deflate.h
/* ===========================================================================
 * Internal compression state.
 */

var LENGTH_CODES  = 29;
/* number of length codes, not counting the special END_BLOCK code */

var LITERALS      = 256;
/* number of literal bytes 0..255 */

var L_CODES       = LITERALS + 1 + LENGTH_CODES;
/* number of Literal or Length codes, including the END_BLOCK code */

var D_CODES       = 30;
/* number of distance codes */

var BL_CODES      = 19;
/* number of codes used to transfer the bit lengths */

var HEAP_SIZE     = 2 * L_CODES + 1;
/* maximum heap size */

var MAX_BITS      = 15;
/* All codes must not exceed MAX_BITS bits */

var Buf_size      = 16;
/* size of bit buffer in bi_buf */


/* ===========================================================================
 * Constants
 */

var MAX_BL_BITS = 7;
/* Bit length codes must not exceed MAX_BL_BITS bits */

var END_BLOCK   = 256;
/* end of block literal code */

var REP_3_6     = 16;
/* repeat previous bit length 3-6 times (2 bits of repeat count) */

var REPZ_3_10   = 17;
/* repeat a zero length 3-10 times  (3 bits of repeat count) */

var REPZ_11_138 = 18;
/* repeat a zero length 11-138 times  (7 bits of repeat count) */

/* eslint-disable comma-spacing,array-bracket-spacing */
var extra_lbits =   /* extra bits for each length code */
  [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];

var extra_dbits =   /* extra bits for each distance code */
  [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];

var extra_blbits =  /* extra bits for each bit length code */
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,3,7];

var bl_order =
  [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
/* eslint-enable comma-spacing,array-bracket-spacing */

/* The lengths of the bit length codes are sent in order of decreasing
 * probability, to avoid transmitting the lengths for unused bit length codes.
 */

/* ===========================================================================
 * Local data. These are initialized only once.
 */

// We pre-fill arrays with 0 to avoid uninitialized gaps

var DIST_CODE_LEN = 512; /* see definition of array dist_code below */

// !!!! Use flat array instead of structure, Freq = i*2, Len = i*2+1
var static_ltree  = new Array((L_CODES + 2) * 2);
zero(static_ltree);
/* The static literal tree. Since the bit lengths are imposed, there is no
 * need for the L_CODES extra codes used during heap construction. However
 * The codes 286 and 287 are needed to build a canonical tree (see _tr_init
 * below).
 */

var static_dtree  = new Array(D_CODES * 2);
zero(static_dtree);
/* The static distance tree. (Actually a trivial tree since all codes use
 * 5 bits.)
 */

var _dist_code    = new Array(DIST_CODE_LEN);
zero(_dist_code);
/* Distance codes. The first 256 values correspond to the distances
 * 3 .. 258, the last 256 values correspond to the top 8 bits of
 * the 15 bit distances.
 */

var _length_code  = new Array(MAX_MATCH - MIN_MATCH + 1);
zero(_length_code);
/* length code for each normalized match length (0 == MIN_MATCH) */

var base_length   = new Array(LENGTH_CODES);
zero(base_length);
/* First normalized length for each code (0 = MIN_MATCH) */

var base_dist     = new Array(D_CODES);
zero(base_dist);
/* First normalized distance for each code (0 = distance of 1) */


function StaticTreeDesc(static_tree, extra_bits, extra_base, elems, max_length) {

  this.static_tree  = static_tree;  /* static tree or NULL */
  this.extra_bits   = extra_bits;   /* extra bits for each code or NULL */
  this.extra_base   = extra_base;   /* base index for extra_bits */
  this.elems        = elems;        /* max number of elements in the tree */
  this.max_length   = max_length;   /* max bit length for the codes */

  // show if `static_tree` has data or dummy - needed for monomorphic objects
  this.has_stree    = static_tree && static_tree.length;
}


var static_l_desc;
var static_d_desc;
var static_bl_desc;


function TreeDesc(dyn_tree, stat_desc) {
  this.dyn_tree = dyn_tree;     /* the dynamic tree */
  this.max_code = 0;            /* largest code with non zero frequency */
  this.stat_desc = stat_desc;   /* the corresponding static tree */
}



function d_code(dist) {
  return dist < 256 ? _dist_code[dist] : _dist_code[256 + (dist >>> 7)];
}


/* ===========================================================================
 * Output a short LSB first on the stream.
 * IN assertion: there is enough room in pendingBuf.
 */
function put_short(s, w) {
//    put_byte(s, (uch)((w) & 0xff));
//    put_byte(s, (uch)((ush)(w) >> 8));
  s.pending_buf[s.pending++] = (w) & 0xff;
  s.pending_buf[s.pending++] = (w >>> 8) & 0xff;
}


/* ===========================================================================
 * Send a value on a given number of bits.
 * IN assertion: length <= 16 and value fits in length bits.
 */
function send_bits(s, value, length) {
  if (s.bi_valid > (Buf_size - length)) {
    s.bi_buf |= (value << s.bi_valid) & 0xffff;
    put_short(s, s.bi_buf);
    s.bi_buf = value >> (Buf_size - s.bi_valid);
    s.bi_valid += length - Buf_size;
  } else {
    s.bi_buf |= (value << s.bi_valid) & 0xffff;
    s.bi_valid += length;
  }
}


function send_code(s, c, tree) {
  send_bits(s, tree[c * 2]/*.Code*/, tree[c * 2 + 1]/*.Len*/);
}


/* ===========================================================================
 * Reverse the first len bits of a code, using straightforward code (a faster
 * method would use a table)
 * IN assertion: 1 <= len <= 15
 */
function bi_reverse(code, len) {
  var res = 0;
  do {
    res |= code & 1;
    code >>>= 1;
    res <<= 1;
  } while (--len > 0);
  return res >>> 1;
}


/* ===========================================================================
 * Flush the bit buffer, keeping at most 7 bits in it.
 */
function bi_flush(s) {
  if (s.bi_valid === 16) {
    put_short(s, s.bi_buf);
    s.bi_buf = 0;
    s.bi_valid = 0;

  } else if (s.bi_valid >= 8) {
    s.pending_buf[s.pending++] = s.bi_buf & 0xff;
    s.bi_buf >>= 8;
    s.bi_valid -= 8;
  }
}


/* ===========================================================================
 * Compute the optimal bit lengths for a tree and update the total bit length
 * for the current block.
 * IN assertion: the fields freq and dad are set, heap[heap_max] and
 *    above are the tree nodes sorted by increasing frequency.
 * OUT assertions: the field len is set to the optimal bit length, the
 *     array bl_count contains the frequencies for each bit length.
 *     The length opt_len is updated; static_len is also updated if stree is
 *     not null.
 */
function gen_bitlen(s, desc)
//    deflate_state *s;
//    tree_desc *desc;    /* the tree descriptor */
{
  var tree            = desc.dyn_tree;
  var max_code        = desc.max_code;
  var stree           = desc.stat_desc.static_tree;
  var has_stree       = desc.stat_desc.has_stree;
  var extra           = desc.stat_desc.extra_bits;
  var base            = desc.stat_desc.extra_base;
  var max_length      = desc.stat_desc.max_length;
  var h;              /* heap index */
  var n, m;           /* iterate over the tree elements */
  var bits;           /* bit length */
  var xbits;          /* extra bits */
  var f;              /* frequency */
  var overflow = 0;   /* number of elements with bit length too large */

  for (bits = 0; bits <= MAX_BITS; bits++) {
    s.bl_count[bits] = 0;
  }

  /* In a first pass, compute the optimal bit lengths (which may
   * overflow in the case of the bit length tree).
   */
  tree[s.heap[s.heap_max] * 2 + 1]/*.Len*/ = 0; /* root of the heap */

  for (h = s.heap_max + 1; h < HEAP_SIZE; h++) {
    n = s.heap[h];
    bits = tree[tree[n * 2 + 1]/*.Dad*/ * 2 + 1]/*.Len*/ + 1;
    if (bits > max_length) {
      bits = max_length;
      overflow++;
    }
    tree[n * 2 + 1]/*.Len*/ = bits;
    /* We overwrite tree[n].Dad which is no longer needed */

    if (n > max_code) { continue; } /* not a leaf node */

    s.bl_count[bits]++;
    xbits = 0;
    if (n >= base) {
      xbits = extra[n - base];
    }
    f = tree[n * 2]/*.Freq*/;
    s.opt_len += f * (bits + xbits);
    if (has_stree) {
      s.static_len += f * (stree[n * 2 + 1]/*.Len*/ + xbits);
    }
  }
  if (overflow === 0) { return; }

  // Trace((stderr,"\nbit length overflow\n"));
  /* This happens for example on obj2 and pic of the Calgary corpus */

  /* Find the first bit length which could increase: */
  do {
    bits = max_length - 1;
    while (s.bl_count[bits] === 0) { bits--; }
    s.bl_count[bits]--;      /* move one leaf down the tree */
    s.bl_count[bits + 1] += 2; /* move one overflow item as its brother */
    s.bl_count[max_length]--;
    /* The brother of the overflow item also moves one step up,
     * but this does not affect bl_count[max_length]
     */
    overflow -= 2;
  } while (overflow > 0);

  /* Now recompute all bit lengths, scanning in increasing frequency.
   * h is still equal to HEAP_SIZE. (It is simpler to reconstruct all
   * lengths instead of fixing only the wrong ones. This idea is taken
   * from 'ar' written by Haruhiko Okumura.)
   */
  for (bits = max_length; bits !== 0; bits--) {
    n = s.bl_count[bits];
    while (n !== 0) {
      m = s.heap[--h];
      if (m > max_code) { continue; }
      if (tree[m * 2 + 1]/*.Len*/ !== bits) {
        // Trace((stderr,"code %d bits %d->%d\n", m, tree[m].Len, bits));
        s.opt_len += (bits - tree[m * 2 + 1]/*.Len*/) * tree[m * 2]/*.Freq*/;
        tree[m * 2 + 1]/*.Len*/ = bits;
      }
      n--;
    }
  }
}


/* ===========================================================================
 * Generate the codes for a given tree and bit counts (which need not be
 * optimal).
 * IN assertion: the array bl_count contains the bit length statistics for
 * the given tree and the field len is set for all tree elements.
 * OUT assertion: the field code is set for all tree elements of non
 *     zero code length.
 */
function gen_codes(tree, max_code, bl_count)
//    ct_data *tree;             /* the tree to decorate */
//    int max_code;              /* largest code with non zero frequency */
//    ushf *bl_count;            /* number of codes at each bit length */
{
  var next_code = new Array(MAX_BITS + 1); /* next code value for each bit length */
  var code = 0;              /* running code value */
  var bits;                  /* bit index */
  var n;                     /* code index */

  /* The distribution counts are first used to generate the code values
   * without bit reversal.
   */
  for (bits = 1; bits <= MAX_BITS; bits++) {
    next_code[bits] = code = (code + bl_count[bits - 1]) << 1;
  }
  /* Check that the bit counts in bl_count are consistent. The last code
   * must be all ones.
   */
  //Assert (code + bl_count[MAX_BITS]-1 == (1<<MAX_BITS)-1,
  //        "inconsistent bit counts");
  //Tracev((stderr,"\ngen_codes: max_code %d ", max_code));

  for (n = 0;  n <= max_code; n++) {
    var len = tree[n * 2 + 1]/*.Len*/;
    if (len === 0) { continue; }
    /* Now reverse the bits */
    tree[n * 2]/*.Code*/ = bi_reverse(next_code[len]++, len);

    //Tracecv(tree != static_ltree, (stderr,"\nn %3d %c l %2d c %4x (%x) ",
    //     n, (isgraph(n) ? n : ' '), len, tree[n].Code, next_code[len]-1));
  }
}


/* ===========================================================================
 * Initialize the various 'constant' tables.
 */
function tr_static_init() {
  var n;        /* iterates over tree elements */
  var bits;     /* bit counter */
  var length;   /* length value */
  var code;     /* code value */
  var dist;     /* distance index */
  var bl_count = new Array(MAX_BITS + 1);
  /* number of codes at each bit length for an optimal tree */

  // do check in _tr_init()
  //if (static_init_done) return;

  /* For some embedded targets, global variables are not initialized: */
/*#ifdef NO_INIT_GLOBAL_POINTERS
  static_l_desc.static_tree = static_ltree;
  static_l_desc.extra_bits = extra_lbits;
  static_d_desc.static_tree = static_dtree;
  static_d_desc.extra_bits = extra_dbits;
  static_bl_desc.extra_bits = extra_blbits;
#endif*/

  /* Initialize the mapping length (0..255) -> length code (0..28) */
  length = 0;
  for (code = 0; code < LENGTH_CODES - 1; code++) {
    base_length[code] = length;
    for (n = 0; n < (1 << extra_lbits[code]); n++) {
      _length_code[length++] = code;
    }
  }
  //Assert (length == 256, "tr_static_init: length != 256");
  /* Note that the length 255 (match length 258) can be represented
   * in two different ways: code 284 + 5 bits or code 285, so we
   * overwrite length_code[255] to use the best encoding:
   */
  _length_code[length - 1] = code;

  /* Initialize the mapping dist (0..32K) -> dist code (0..29) */
  dist = 0;
  for (code = 0; code < 16; code++) {
    base_dist[code] = dist;
    for (n = 0; n < (1 << extra_dbits[code]); n++) {
      _dist_code[dist++] = code;
    }
  }
  //Assert (dist == 256, "tr_static_init: dist != 256");
  dist >>= 7; /* from now on, all distances are divided by 128 */
  for (; code < D_CODES; code++) {
    base_dist[code] = dist << 7;
    for (n = 0; n < (1 << (extra_dbits[code] - 7)); n++) {
      _dist_code[256 + dist++] = code;
    }
  }
  //Assert (dist == 256, "tr_static_init: 256+dist != 512");

  /* Construct the codes of the static literal tree */
  for (bits = 0; bits <= MAX_BITS; bits++) {
    bl_count[bits] = 0;
  }

  n = 0;
  while (n <= 143) {
    static_ltree[n * 2 + 1]/*.Len*/ = 8;
    n++;
    bl_count[8]++;
  }
  while (n <= 255) {
    static_ltree[n * 2 + 1]/*.Len*/ = 9;
    n++;
    bl_count[9]++;
  }
  while (n <= 279) {
    static_ltree[n * 2 + 1]/*.Len*/ = 7;
    n++;
    bl_count[7]++;
  }
  while (n <= 287) {
    static_ltree[n * 2 + 1]/*.Len*/ = 8;
    n++;
    bl_count[8]++;
  }
  /* Codes 286 and 287 do not exist, but we must include them in the
   * tree construction to get a canonical Huffman tree (longest code
   * all ones)
   */
  gen_codes(static_ltree, L_CODES + 1, bl_count);

  /* The static distance tree is trivial: */
  for (n = 0; n < D_CODES; n++) {
    static_dtree[n * 2 + 1]/*.Len*/ = 5;
    static_dtree[n * 2]/*.Code*/ = bi_reverse(n, 5);
  }

  // Now data ready and we can init static trees
  static_l_desc = new StaticTreeDesc(static_ltree, extra_lbits, LITERALS + 1, L_CODES, MAX_BITS);
  static_d_desc = new StaticTreeDesc(static_dtree, extra_dbits, 0,          D_CODES, MAX_BITS);
  static_bl_desc = new StaticTreeDesc(new Array(0), extra_blbits, 0,         BL_CODES, MAX_BL_BITS);

  //static_init_done = true;
}


/* ===========================================================================
 * Initialize a new block.
 */
function init_block(s) {
  var n; /* iterates over tree elements */

  /* Initialize the trees. */
  for (n = 0; n < L_CODES;  n++) { s.dyn_ltree[n * 2]/*.Freq*/ = 0; }
  for (n = 0; n < D_CODES;  n++) { s.dyn_dtree[n * 2]/*.Freq*/ = 0; }
  for (n = 0; n < BL_CODES; n++) { s.bl_tree[n * 2]/*.Freq*/ = 0; }

  s.dyn_ltree[END_BLOCK * 2]/*.Freq*/ = 1;
  s.opt_len = s.static_len = 0;
  s.last_lit = s.matches = 0;
}


/* ===========================================================================
 * Flush the bit buffer and align the output on a byte boundary
 */
function bi_windup(s)
{
  if (s.bi_valid > 8) {
    put_short(s, s.bi_buf);
  } else if (s.bi_valid > 0) {
    //put_byte(s, (Byte)s->bi_buf);
    s.pending_buf[s.pending++] = s.bi_buf;
  }
  s.bi_buf = 0;
  s.bi_valid = 0;
}

/* ===========================================================================
 * Copy a stored block, storing first the length and its
 * one's complement if requested.
 */
function copy_block(s, buf, len, header)
//DeflateState *s;
//charf    *buf;    /* the input data */
//unsigned len;     /* its length */
//int      header;  /* true if block header must be written */
{
  bi_windup(s);        /* align on byte boundary */

  if (header) {
    put_short(s, len);
    put_short(s, ~len);
  }
//  while (len--) {
//    put_byte(s, *buf++);
//  }
  utils.arraySet(s.pending_buf, s.window, buf, len, s.pending);
  s.pending += len;
}

/* ===========================================================================
 * Compares to subtrees, using the tree depth as tie breaker when
 * the subtrees have equal frequency. This minimizes the worst case length.
 */
function smaller(tree, n, m, depth) {
  var _n2 = n * 2;
  var _m2 = m * 2;
  return (tree[_n2]/*.Freq*/ < tree[_m2]/*.Freq*/ ||
         (tree[_n2]/*.Freq*/ === tree[_m2]/*.Freq*/ && depth[n] <= depth[m]));
}

/* ===========================================================================
 * Restore the heap property by moving down the tree starting at node k,
 * exchanging a node with the smallest of its two sons if necessary, stopping
 * when the heap property is re-established (each father smaller than its
 * two sons).
 */
function pqdownheap(s, tree, k)
//    deflate_state *s;
//    ct_data *tree;  /* the tree to restore */
//    int k;               /* node to move down */
{
  var v = s.heap[k];
  var j = k << 1;  /* left son of k */
  while (j <= s.heap_len) {
    /* Set j to the smallest of the two sons: */
    if (j < s.heap_len &&
      smaller(tree, s.heap[j + 1], s.heap[j], s.depth)) {
      j++;
    }
    /* Exit if v is smaller than both sons */
    if (smaller(tree, v, s.heap[j], s.depth)) { break; }

    /* Exchange v with the smallest son */
    s.heap[k] = s.heap[j];
    k = j;

    /* And continue down the tree, setting j to the left son of k */
    j <<= 1;
  }
  s.heap[k] = v;
}


// inlined manually
// var SMALLEST = 1;

/* ===========================================================================
 * Send the block data compressed using the given Huffman trees
 */
function compress_block(s, ltree, dtree)
//    deflate_state *s;
//    const ct_data *ltree; /* literal tree */
//    const ct_data *dtree; /* distance tree */
{
  var dist;           /* distance of matched string */
  var lc;             /* match length or unmatched char (if dist == 0) */
  var lx = 0;         /* running index in l_buf */
  var code;           /* the code to send */
  var extra;          /* number of extra bits to send */

  if (s.last_lit !== 0) {
    do {
      dist = (s.pending_buf[s.d_buf + lx * 2] << 8) | (s.pending_buf[s.d_buf + lx * 2 + 1]);
      lc = s.pending_buf[s.l_buf + lx];
      lx++;

      if (dist === 0) {
        send_code(s, lc, ltree); /* send a literal byte */
        //Tracecv(isgraph(lc), (stderr," '%c' ", lc));
      } else {
        /* Here, lc is the match length - MIN_MATCH */
        code = _length_code[lc];
        send_code(s, code + LITERALS + 1, ltree); /* send the length code */
        extra = extra_lbits[code];
        if (extra !== 0) {
          lc -= base_length[code];
          send_bits(s, lc, extra);       /* send the extra length bits */
        }
        dist--; /* dist is now the match distance - 1 */
        code = d_code(dist);
        //Assert (code < D_CODES, "bad d_code");

        send_code(s, code, dtree);       /* send the distance code */
        extra = extra_dbits[code];
        if (extra !== 0) {
          dist -= base_dist[code];
          send_bits(s, dist, extra);   /* send the extra distance bits */
        }
      } /* literal or match pair ? */

      /* Check that the overlay between pending_buf and d_buf+l_buf is ok: */
      //Assert((uInt)(s->pending) < s->lit_bufsize + 2*lx,
      //       "pendingBuf overflow");

    } while (lx < s.last_lit);
  }

  send_code(s, END_BLOCK, ltree);
}


/* ===========================================================================
 * Construct one Huffman tree and assigns the code bit strings and lengths.
 * Update the total bit length for the current block.
 * IN assertion: the field freq is set for all tree elements.
 * OUT assertions: the fields len and code are set to the optimal bit length
 *     and corresponding code. The length opt_len is updated; static_len is
 *     also updated if stree is not null. The field max_code is set.
 */
function build_tree(s, desc)
//    deflate_state *s;
//    tree_desc *desc; /* the tree descriptor */
{
  var tree     = desc.dyn_tree;
  var stree    = desc.stat_desc.static_tree;
  var has_stree = desc.stat_desc.has_stree;
  var elems    = desc.stat_desc.elems;
  var n, m;          /* iterate over heap elements */
  var max_code = -1; /* largest code with non zero frequency */
  var node;          /* new node being created */

  /* Construct the initial heap, with least frequent element in
   * heap[SMALLEST]. The sons of heap[n] are heap[2*n] and heap[2*n+1].
   * heap[0] is not used.
   */
  s.heap_len = 0;
  s.heap_max = HEAP_SIZE;

  for (n = 0; n < elems; n++) {
    if (tree[n * 2]/*.Freq*/ !== 0) {
      s.heap[++s.heap_len] = max_code = n;
      s.depth[n] = 0;

    } else {
      tree[n * 2 + 1]/*.Len*/ = 0;
    }
  }

  /* The pkzip format requires that at least one distance code exists,
   * and that at least one bit should be sent even if there is only one
   * possible code. So to avoid special checks later on we force at least
   * two codes of non zero frequency.
   */
  while (s.heap_len < 2) {
    node = s.heap[++s.heap_len] = (max_code < 2 ? ++max_code : 0);
    tree[node * 2]/*.Freq*/ = 1;
    s.depth[node] = 0;
    s.opt_len--;

    if (has_stree) {
      s.static_len -= stree[node * 2 + 1]/*.Len*/;
    }
    /* node is 0 or 1 so it does not have extra bits */
  }
  desc.max_code = max_code;

  /* The elements heap[heap_len/2+1 .. heap_len] are leaves of the tree,
   * establish sub-heaps of increasing lengths:
   */
  for (n = (s.heap_len >> 1/*int /2*/); n >= 1; n--) { pqdownheap(s, tree, n); }

  /* Construct the Huffman tree by repeatedly combining the least two
   * frequent nodes.
   */
  node = elems;              /* next internal node of the tree */
  do {
    //pqremove(s, tree, n);  /* n = node of least frequency */
    /*** pqremove ***/
    n = s.heap[1/*SMALLEST*/];
    s.heap[1/*SMALLEST*/] = s.heap[s.heap_len--];
    pqdownheap(s, tree, 1/*SMALLEST*/);
    /***/

    m = s.heap[1/*SMALLEST*/]; /* m = node of next least frequency */

    s.heap[--s.heap_max] = n; /* keep the nodes sorted by frequency */
    s.heap[--s.heap_max] = m;

    /* Create a new node father of n and m */
    tree[node * 2]/*.Freq*/ = tree[n * 2]/*.Freq*/ + tree[m * 2]/*.Freq*/;
    s.depth[node] = (s.depth[n] >= s.depth[m] ? s.depth[n] : s.depth[m]) + 1;
    tree[n * 2 + 1]/*.Dad*/ = tree[m * 2 + 1]/*.Dad*/ = node;

    /* and insert the new node in the heap */
    s.heap[1/*SMALLEST*/] = node++;
    pqdownheap(s, tree, 1/*SMALLEST*/);

  } while (s.heap_len >= 2);

  s.heap[--s.heap_max] = s.heap[1/*SMALLEST*/];

  /* At this point, the fields freq and dad are set. We can now
   * generate the bit lengths.
   */
  gen_bitlen(s, desc);

  /* The field len is now set, we can generate the bit codes */
  gen_codes(tree, max_code, s.bl_count);
}


/* ===========================================================================
 * Scan a literal or distance tree to determine the frequencies of the codes
 * in the bit length tree.
 */
function scan_tree(s, tree, max_code)
//    deflate_state *s;
//    ct_data *tree;   /* the tree to be scanned */
//    int max_code;    /* and its largest code of non zero frequency */
{
  var n;                     /* iterates over all tree elements */
  var prevlen = -1;          /* last emitted length */
  var curlen;                /* length of current code */

  var nextlen = tree[0 * 2 + 1]/*.Len*/; /* length of next code */

  var count = 0;             /* repeat count of the current code */
  var max_count = 7;         /* max repeat count */
  var min_count = 4;         /* min repeat count */

  if (nextlen === 0) {
    max_count = 138;
    min_count = 3;
  }
  tree[(max_code + 1) * 2 + 1]/*.Len*/ = 0xffff; /* guard */

  for (n = 0; n <= max_code; n++) {
    curlen = nextlen;
    nextlen = tree[(n + 1) * 2 + 1]/*.Len*/;

    if (++count < max_count && curlen === nextlen) {
      continue;

    } else if (count < min_count) {
      s.bl_tree[curlen * 2]/*.Freq*/ += count;

    } else if (curlen !== 0) {

      if (curlen !== prevlen) { s.bl_tree[curlen * 2]/*.Freq*/++; }
      s.bl_tree[REP_3_6 * 2]/*.Freq*/++;

    } else if (count <= 10) {
      s.bl_tree[REPZ_3_10 * 2]/*.Freq*/++;

    } else {
      s.bl_tree[REPZ_11_138 * 2]/*.Freq*/++;
    }

    count = 0;
    prevlen = curlen;

    if (nextlen === 0) {
      max_count = 138;
      min_count = 3;

    } else if (curlen === nextlen) {
      max_count = 6;
      min_count = 3;

    } else {
      max_count = 7;
      min_count = 4;
    }
  }
}


/* ===========================================================================
 * Send a literal or distance tree in compressed form, using the codes in
 * bl_tree.
 */
function send_tree(s, tree, max_code)
//    deflate_state *s;
//    ct_data *tree; /* the tree to be scanned */
//    int max_code;       /* and its largest code of non zero frequency */
{
  var n;                     /* iterates over all tree elements */
  var prevlen = -1;          /* last emitted length */
  var curlen;                /* length of current code */

  var nextlen = tree[0 * 2 + 1]/*.Len*/; /* length of next code */

  var count = 0;             /* repeat count of the current code */
  var max_count = 7;         /* max repeat count */
  var min_count = 4;         /* min repeat count */

  /* tree[max_code+1].Len = -1; */  /* guard already set */
  if (nextlen === 0) {
    max_count = 138;
    min_count = 3;
  }

  for (n = 0; n <= max_code; n++) {
    curlen = nextlen;
    nextlen = tree[(n + 1) * 2 + 1]/*.Len*/;

    if (++count < max_count && curlen === nextlen) {
      continue;

    } else if (count < min_count) {
      do { send_code(s, curlen, s.bl_tree); } while (--count !== 0);

    } else if (curlen !== 0) {
      if (curlen !== prevlen) {
        send_code(s, curlen, s.bl_tree);
        count--;
      }
      //Assert(count >= 3 && count <= 6, " 3_6?");
      send_code(s, REP_3_6, s.bl_tree);
      send_bits(s, count - 3, 2);

    } else if (count <= 10) {
      send_code(s, REPZ_3_10, s.bl_tree);
      send_bits(s, count - 3, 3);

    } else {
      send_code(s, REPZ_11_138, s.bl_tree);
      send_bits(s, count - 11, 7);
    }

    count = 0;
    prevlen = curlen;
    if (nextlen === 0) {
      max_count = 138;
      min_count = 3;

    } else if (curlen === nextlen) {
      max_count = 6;
      min_count = 3;

    } else {
      max_count = 7;
      min_count = 4;
    }
  }
}


/* ===========================================================================
 * Construct the Huffman tree for the bit lengths and return the index in
 * bl_order of the last bit length code to send.
 */
function build_bl_tree(s) {
  var max_blindex;  /* index of last bit length code of non zero freq */

  /* Determine the bit length frequencies for literal and distance trees */
  scan_tree(s, s.dyn_ltree, s.l_desc.max_code);
  scan_tree(s, s.dyn_dtree, s.d_desc.max_code);

  /* Build the bit length tree: */
  build_tree(s, s.bl_desc);
  /* opt_len now includes the length of the tree representations, except
   * the lengths of the bit lengths codes and the 5+5+4 bits for the counts.
   */

  /* Determine the number of bit length codes to send. The pkzip format
   * requires that at least 4 bit length codes be sent. (appnote.txt says
   * 3 but the actual value used is 4.)
   */
  for (max_blindex = BL_CODES - 1; max_blindex >= 3; max_blindex--) {
    if (s.bl_tree[bl_order[max_blindex] * 2 + 1]/*.Len*/ !== 0) {
      break;
    }
  }
  /* Update opt_len to include the bit length tree and counts */
  s.opt_len += 3 * (max_blindex + 1) + 5 + 5 + 4;
  //Tracev((stderr, "\ndyn trees: dyn %ld, stat %ld",
  //        s->opt_len, s->static_len));

  return max_blindex;
}


/* ===========================================================================
 * Send the header for a block using dynamic Huffman trees: the counts, the
 * lengths of the bit length codes, the literal tree and the distance tree.
 * IN assertion: lcodes >= 257, dcodes >= 1, blcodes >= 4.
 */
function send_all_trees(s, lcodes, dcodes, blcodes)
//    deflate_state *s;
//    int lcodes, dcodes, blcodes; /* number of codes for each tree */
{
  var rank;                    /* index in bl_order */

  //Assert (lcodes >= 257 && dcodes >= 1 && blcodes >= 4, "not enough codes");
  //Assert (lcodes <= L_CODES && dcodes <= D_CODES && blcodes <= BL_CODES,
  //        "too many codes");
  //Tracev((stderr, "\nbl counts: "));
  send_bits(s, lcodes - 257, 5); /* not +255 as stated in appnote.txt */
  send_bits(s, dcodes - 1,   5);
  send_bits(s, blcodes - 4,  4); /* not -3 as stated in appnote.txt */
  for (rank = 0; rank < blcodes; rank++) {
    //Tracev((stderr, "\nbl code %2d ", bl_order[rank]));
    send_bits(s, s.bl_tree[bl_order[rank] * 2 + 1]/*.Len*/, 3);
  }
  //Tracev((stderr, "\nbl tree: sent %ld", s->bits_sent));

  send_tree(s, s.dyn_ltree, lcodes - 1); /* literal tree */
  //Tracev((stderr, "\nlit tree: sent %ld", s->bits_sent));

  send_tree(s, s.dyn_dtree, dcodes - 1); /* distance tree */
  //Tracev((stderr, "\ndist tree: sent %ld", s->bits_sent));
}


/* ===========================================================================
 * Check if the data type is TEXT or BINARY, using the following algorithm:
 * - TEXT if the two conditions below are satisfied:
 *    a) There are no non-portable control characters belonging to the
 *       "black list" (0..6, 14..25, 28..31).
 *    b) There is at least one printable character belonging to the
 *       "white list" (9 {TAB}, 10 {LF}, 13 {CR}, 32..255).
 * - BINARY otherwise.
 * - The following partially-portable control characters form a
 *   "gray list" that is ignored in this detection algorithm:
 *   (7 {BEL}, 8 {BS}, 11 {VT}, 12 {FF}, 26 {SUB}, 27 {ESC}).
 * IN assertion: the fields Freq of dyn_ltree are set.
 */
function detect_data_type(s) {
  /* black_mask is the bit mask of black-listed bytes
   * set bits 0..6, 14..25, and 28..31
   * 0xf3ffc07f = binary 11110011111111111100000001111111
   */
  var black_mask = 0xf3ffc07f;
  var n;

  /* Check for non-textual ("black-listed") bytes. */
  for (n = 0; n <= 31; n++, black_mask >>>= 1) {
    if ((black_mask & 1) && (s.dyn_ltree[n * 2]/*.Freq*/ !== 0)) {
      return Z_BINARY;
    }
  }

  /* Check for textual ("white-listed") bytes. */
  if (s.dyn_ltree[9 * 2]/*.Freq*/ !== 0 || s.dyn_ltree[10 * 2]/*.Freq*/ !== 0 ||
      s.dyn_ltree[13 * 2]/*.Freq*/ !== 0) {
    return Z_TEXT;
  }
  for (n = 32; n < LITERALS; n++) {
    if (s.dyn_ltree[n * 2]/*.Freq*/ !== 0) {
      return Z_TEXT;
    }
  }

  /* There are no "black-listed" or "white-listed" bytes:
   * this stream either is empty or has tolerated ("gray-listed") bytes only.
   */
  return Z_BINARY;
}


var static_init_done = false;

/* ===========================================================================
 * Initialize the tree data structures for a new zlib stream.
 */
function _tr_init(s)
{

  if (!static_init_done) {
    tr_static_init();
    static_init_done = true;
  }

  s.l_desc  = new TreeDesc(s.dyn_ltree, static_l_desc);
  s.d_desc  = new TreeDesc(s.dyn_dtree, static_d_desc);
  s.bl_desc = new TreeDesc(s.bl_tree, static_bl_desc);

  s.bi_buf = 0;
  s.bi_valid = 0;

  /* Initialize the first block of the first file: */
  init_block(s);
}


/* ===========================================================================
 * Send a stored block
 */
function _tr_stored_block(s, buf, stored_len, last)
//DeflateState *s;
//charf *buf;       /* input block */
//ulg stored_len;   /* length of input block */
//int last;         /* one if this is the last block for a file */
{
  send_bits(s, (STORED_BLOCK << 1) + (last ? 1 : 0), 3);    /* send block type */
  copy_block(s, buf, stored_len, true); /* with header */
}


/* ===========================================================================
 * Send one empty static block to give enough lookahead for inflate.
 * This takes 10 bits, of which 7 may remain in the bit buffer.
 */
function _tr_align(s) {
  send_bits(s, STATIC_TREES << 1, 3);
  send_code(s, END_BLOCK, static_ltree);
  bi_flush(s);
}


/* ===========================================================================
 * Determine the best encoding for the current block: dynamic trees, static
 * trees or store, and output the encoded block to the zip file.
 */
function _tr_flush_block(s, buf, stored_len, last)
//DeflateState *s;
//charf *buf;       /* input block, or NULL if too old */
//ulg stored_len;   /* length of input block */
//int last;         /* one if this is the last block for a file */
{
  var opt_lenb, static_lenb;  /* opt_len and static_len in bytes */
  var max_blindex = 0;        /* index of last bit length code of non zero freq */

  /* Build the Huffman trees unless a stored block is forced */
  if (s.level > 0) {

    /* Check if the file is binary or text */
    if (s.strm.data_type === Z_UNKNOWN) {
      s.strm.data_type = detect_data_type(s);
    }

    /* Construct the literal and distance trees */
    build_tree(s, s.l_desc);
    // Tracev((stderr, "\nlit data: dyn %ld, stat %ld", s->opt_len,
    //        s->static_len));

    build_tree(s, s.d_desc);
    // Tracev((stderr, "\ndist data: dyn %ld, stat %ld", s->opt_len,
    //        s->static_len));
    /* At this point, opt_len and static_len are the total bit lengths of
     * the compressed block data, excluding the tree representations.
     */

    /* Build the bit length tree for the above two trees, and get the index
     * in bl_order of the last bit length code to send.
     */
    max_blindex = build_bl_tree(s);

    /* Determine the best encoding. Compute the block lengths in bytes. */
    opt_lenb = (s.opt_len + 3 + 7) >>> 3;
    static_lenb = (s.static_len + 3 + 7) >>> 3;

    // Tracev((stderr, "\nopt %lu(%lu) stat %lu(%lu) stored %lu lit %u ",
    //        opt_lenb, s->opt_len, static_lenb, s->static_len, stored_len,
    //        s->last_lit));

    if (static_lenb <= opt_lenb) { opt_lenb = static_lenb; }

  } else {
    // Assert(buf != (char*)0, "lost buf");
    opt_lenb = static_lenb = stored_len + 5; /* force a stored block */
  }

  if ((stored_len + 4 <= opt_lenb) && (buf !== -1)) {
    /* 4: two words for the lengths */

    /* The test buf != NULL is only necessary if LIT_BUFSIZE > WSIZE.
     * Otherwise we can't have processed more than WSIZE input bytes since
     * the last block flush, because compression would have been
     * successful. If LIT_BUFSIZE <= WSIZE, it is never too late to
     * transform a block into a stored block.
     */
    _tr_stored_block(s, buf, stored_len, last);

  } else if (s.strategy === Z_FIXED || static_lenb === opt_lenb) {

    send_bits(s, (STATIC_TREES << 1) + (last ? 1 : 0), 3);
    compress_block(s, static_ltree, static_dtree);

  } else {
    send_bits(s, (DYN_TREES << 1) + (last ? 1 : 0), 3);
    send_all_trees(s, s.l_desc.max_code + 1, s.d_desc.max_code + 1, max_blindex + 1);
    compress_block(s, s.dyn_ltree, s.dyn_dtree);
  }
  // Assert (s->compressed_len == s->bits_sent, "bad compressed size");
  /* The above check is made mod 2^32, for files larger than 512 MB
   * and uLong implemented on 32 bits.
   */
  init_block(s);

  if (last) {
    bi_windup(s);
  }
  // Tracev((stderr,"\ncomprlen %lu(%lu) ", s->compressed_len>>3,
  //       s->compressed_len-7*last));
}

/* ===========================================================================
 * Save the match info and tally the frequency counts. Return true if
 * the current block must be flushed.
 */
function _tr_tally(s, dist, lc)
//    deflate_state *s;
//    unsigned dist;  /* distance of matched string */
//    unsigned lc;    /* match length-MIN_MATCH or unmatched char (if dist==0) */
{
  //var out_length, in_length, dcode;

  s.pending_buf[s.d_buf + s.last_lit * 2]     = (dist >>> 8) & 0xff;
  s.pending_buf[s.d_buf + s.last_lit * 2 + 1] = dist & 0xff;

  s.pending_buf[s.l_buf + s.last_lit] = lc & 0xff;
  s.last_lit++;

  if (dist === 0) {
    /* lc is the unmatched char */
    s.dyn_ltree[lc * 2]/*.Freq*/++;
  } else {
    s.matches++;
    /* Here, lc is the match length - MIN_MATCH */
    dist--;             /* dist = match distance - 1 */
    //Assert((ush)dist < (ush)MAX_DIST(s) &&
    //       (ush)lc <= (ush)(MAX_MATCH-MIN_MATCH) &&
    //       (ush)d_code(dist) < (ush)D_CODES,  "_tr_tally: bad match");

    s.dyn_ltree[(_length_code[lc] + LITERALS + 1) * 2]/*.Freq*/++;
    s.dyn_dtree[d_code(dist) * 2]/*.Freq*/++;
  }

// (!) This block is disabled in zlib defaults,
// don't enable it for binary compatibility

//#ifdef TRUNCATE_BLOCK
//  /* Try to guess if it is profitable to stop the current block here */
//  if ((s.last_lit & 0x1fff) === 0 && s.level > 2) {
//    /* Compute an upper bound for the compressed length */
//    out_length = s.last_lit*8;
//    in_length = s.strstart - s.block_start;
//
//    for (dcode = 0; dcode < D_CODES; dcode++) {
//      out_length += s.dyn_dtree[dcode*2]/*.Freq*/ * (5 + extra_dbits[dcode]);
//    }
//    out_length >>>= 3;
//    //Tracev((stderr,"\nlast_lit %u, in %ld, out ~%ld(%ld%%) ",
//    //       s->last_lit, in_length, out_length,
//    //       100L - out_length*100L/in_length));
//    if (s.matches < (s.last_lit>>1)/*int /2*/ && out_length < (in_length>>1)/*int /2*/) {
//      return true;
//    }
//  }
//#endif

  return (s.last_lit === s.lit_bufsize - 1);
  /* We avoid equality with lit_bufsize because of wraparound at 64K
   * on 16 bit machines and because stored blocks are restricted to
   * 64K-1 bytes.
   */
}

exports._tr_init  = _tr_init;
exports._tr_stored_block = _tr_stored_block;
exports._tr_flush_block  = _tr_flush_block;
exports._tr_tally = _tr_tally;
exports._tr_align = _tr_align;

},{"../utils/common":25}],35:[function(require,module,exports){
'use strict';

// (C) 1995-2013 Jean-loup Gailly and Mark Adler
// (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin
//
// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.
//
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:
//
// 1. The origin of this software must not be misrepresented; you must not
//   claim that you wrote the original software. If you use this software
//   in a product, an acknowledgment in the product documentation would be
//   appreciated but is not required.
// 2. Altered source versions must be plainly marked as such, and must not be
//   misrepresented as being the original software.
// 3. This notice may not be removed or altered from any source distribution.

function ZStream() {
  /* next input byte */
  this.input = null; // JS specific, because we have no pointers
  this.next_in = 0;
  /* number of bytes available at input */
  this.avail_in = 0;
  /* total number of input bytes read so far */
  this.total_in = 0;
  /* next output byte should be put there */
  this.output = null; // JS specific, because we have no pointers
  this.next_out = 0;
  /* remaining free space at output */
  this.avail_out = 0;
  /* total number of bytes output so far */
  this.total_out = 0;
  /* last error message, NULL if no error */
  this.msg = ''/*Z_NULL*/;
  /* not visible by applications */
  this.state = null;
  /* best guess about the data type: binary or text */
  this.data_type = 2/*Z_UNKNOWN*/;
  /* adler32 value of the uncompressed data */
  this.adler = 0;
}

module.exports = ZStream;

},{}],36:[function(require,module,exports){
(function (Buffer){(function (){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50

var K_MAX_LENGTH = 0x7fffffff
exports.kMaxLength = K_MAX_LENGTH

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Print warning and recommend using `buffer` v4.x which has an Object
 *               implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * We report that the browser does not support typed arrays if the are not subclassable
 * using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
 * (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
 * for __proto__ and has a buggy typed array implementation.
 */
Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport()

if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== 'undefined' &&
    typeof console.error === 'function') {
  console.error(
    'This browser lacks typed array (Uint8Array) support which is required by ' +
    '`buffer` v5.x. Use `buffer` v4.x if you require old browser support.'
  )
}

function typedArraySupport () {
  // Can typed array instances can be augmented?
  try {
    var arr = new Uint8Array(1)
    arr.__proto__ = { __proto__: Uint8Array.prototype, foo: function () { return 42 } }
    return arr.foo() === 42
  } catch (e) {
    return false
  }
}

Object.defineProperty(Buffer.prototype, 'parent', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.buffer
  }
})

Object.defineProperty(Buffer.prototype, 'offset', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.byteOffset
  }
})

function createBuffer (length) {
  if (length > K_MAX_LENGTH) {
    throw new RangeError('The value "' + length + '" is invalid for option "size"')
  }
  // Return an augmented `Uint8Array` instance
  var buf = new Uint8Array(length)
  buf.__proto__ = Buffer.prototype
  return buf
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new TypeError(
        'The "string" argument must be of type string. Received type number'
      )
    }
    return allocUnsafe(arg)
  }
  return from(arg, encodingOrOffset, length)
}

// Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
if (typeof Symbol !== 'undefined' && Symbol.species != null &&
    Buffer[Symbol.species] === Buffer) {
  Object.defineProperty(Buffer, Symbol.species, {
    value: null,
    configurable: true,
    enumerable: false,
    writable: false
  })
}

Buffer.poolSize = 8192 // not used by this implementation

function from (value, encodingOrOffset, length) {
  if (typeof value === 'string') {
    return fromString(value, encodingOrOffset)
  }

  if (ArrayBuffer.isView(value)) {
    return fromArrayLike(value)
  }

  if (value == null) {
    throw TypeError(
      'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
      'or Array-like Object. Received type ' + (typeof value)
    )
  }

  if (isInstance(value, ArrayBuffer) ||
      (value && isInstance(value.buffer, ArrayBuffer))) {
    return fromArrayBuffer(value, encodingOrOffset, length)
  }

  if (typeof value === 'number') {
    throw new TypeError(
      'The "value" argument must not be of type number. Received type number'
    )
  }

  var valueOf = value.valueOf && value.valueOf()
  if (valueOf != null && valueOf !== value) {
    return Buffer.from(valueOf, encodingOrOffset, length)
  }

  var b = fromObject(value)
  if (b) return b

  if (typeof Symbol !== 'undefined' && Symbol.toPrimitive != null &&
      typeof value[Symbol.toPrimitive] === 'function') {
    return Buffer.from(
      value[Symbol.toPrimitive]('string'), encodingOrOffset, length
    )
  }

  throw new TypeError(
    'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
    'or Array-like Object. Received type ' + (typeof value)
  )
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(value, encodingOrOffset, length)
}

// Note: Change prototype *after* Buffer.from is defined to workaround Chrome bug:
// https://github.com/feross/buffer/pull/148
Buffer.prototype.__proto__ = Uint8Array.prototype
Buffer.__proto__ = Uint8Array

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be of type number')
  } else if (size < 0) {
    throw new RangeError('The value "' + size + '" is invalid for option "size"')
  }
}

function alloc (size, fill, encoding) {
  assertSize(size)
  if (size <= 0) {
    return createBuffer(size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(size).fill(fill, encoding)
      : createBuffer(size).fill(fill)
  }
  return createBuffer(size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(size, fill, encoding)
}

function allocUnsafe (size) {
  assertSize(size)
  return createBuffer(size < 0 ? 0 : checked(size) | 0)
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(size)
}
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(size)
}

function fromString (string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('Unknown encoding: ' + encoding)
  }

  var length = byteLength(string, encoding) | 0
  var buf = createBuffer(length)

  var actual = buf.write(string, encoding)

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    buf = buf.slice(0, actual)
  }

  return buf
}

function fromArrayLike (array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0
  var buf = createBuffer(length)
  for (var i = 0; i < length; i += 1) {
    buf[i] = array[i] & 255
  }
  return buf
}

function fromArrayBuffer (array, byteOffset, length) {
  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('"offset" is outside of buffer bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('"length" is outside of buffer bounds')
  }

  var buf
  if (byteOffset === undefined && length === undefined) {
    buf = new Uint8Array(array)
  } else if (length === undefined) {
    buf = new Uint8Array(array, byteOffset)
  } else {
    buf = new Uint8Array(array, byteOffset, length)
  }

  // Return an augmented `Uint8Array` instance
  buf.__proto__ = Buffer.prototype
  return buf
}

function fromObject (obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0
    var buf = createBuffer(len)

    if (buf.length === 0) {
      return buf
    }

    obj.copy(buf, 0, 0, len)
    return buf
  }

  if (obj.length !== undefined) {
    if (typeof obj.length !== 'number' || numberIsNaN(obj.length)) {
      return createBuffer(0)
    }
    return fromArrayLike(obj)
  }

  if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
    return fromArrayLike(obj.data)
  }
}

function checked (length) {
  // Note: cannot use `length < K_MAX_LENGTH` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= K_MAX_LENGTH) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + K_MAX_LENGTH.toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0
  }
  return Buffer.alloc(+length)
}

Buffer.isBuffer = function isBuffer (b) {
  return b != null && b._isBuffer === true &&
    b !== Buffer.prototype // so Buffer.isBuffer(Buffer.prototype) will be false
}

Buffer.compare = function compare (a, b) {
  if (isInstance(a, Uint8Array)) a = Buffer.from(a, a.offset, a.byteLength)
  if (isInstance(b, Uint8Array)) b = Buffer.from(b, b.offset, b.byteLength)
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError(
      'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
    )
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!Array.isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; ++i) {
      length += list[i].length
    }
  }

  var buffer = Buffer.allocUnsafe(length)
  var pos = 0
  for (i = 0; i < list.length; ++i) {
    var buf = list[i]
    if (isInstance(buf, Uint8Array)) {
      buf = Buffer.from(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos)
    pos += buf.length
  }
  return buffer
}

function byteLength (string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length
  }
  if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    throw new TypeError(
      'The "string" argument must be one of type string, Buffer, or ArrayBuffer. ' +
      'Received type ' + typeof string
    )
  }

  var len = string.length
  var mustMatch = (arguments.length > 2 && arguments[2] === true)
  if (!mustMatch && len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) {
          return mustMatch ? -1 : utf8ToBytes(string).length // assume utf8
        }
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0
  start >>>= 0

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8'

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// This property is used by `Buffer.isBuffer` (and the `is-buffer` npm package)
// to detect a Buffer instance. It's not possible to use `instanceof Buffer`
// reliably in a browserify context because there could be multiple different
// copies of the 'buffer' package in use. This method works even for Buffer
// instances that were created from another copy of the `buffer` package.
// See: https://github.com/feross/buffer/issues/154
Buffer.prototype._isBuffer = true

function swap (b, n, m) {
  var i = b[n]
  b[n] = b[m]
  b[m] = i
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1)
  }
  return this
}

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3)
    swap(this, i + 1, i + 2)
  }
  return this
}

Buffer.prototype.swap64 = function swap64 () {
  var len = this.length
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7)
    swap(this, i + 1, i + 6)
    swap(this, i + 2, i + 5)
    swap(this, i + 3, i + 4)
  }
  return this
}

Buffer.prototype.toString = function toString () {
  var length = this.length
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.toLocaleString = Buffer.prototype.toString

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  str = this.toString('hex', 0, max).replace(/(.{2})/g, '$1 ').trim()
  if (this.length > max) str += ' ... '
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (isInstance(target, Uint8Array)) {
    target = Buffer.from(target, target.offset, target.byteLength)
  }
  if (!Buffer.isBuffer(target)) {
    throw new TypeError(
      'The "target" argument must be one of type Buffer or Uint8Array. ' +
      'Received type ' + (typeof target)
    )
  }

  if (start === undefined) {
    start = 0
  }
  if (end === undefined) {
    end = target ? target.length : 0
  }
  if (thisStart === undefined) {
    thisStart = 0
  }
  if (thisEnd === undefined) {
    thisEnd = this.length
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0
  end >>>= 0
  thisStart >>>= 0
  thisEnd >>>= 0

  if (this === target) return 0

  var x = thisEnd - thisStart
  var y = end - start
  var len = Math.min(x, y)

  var thisCopy = this.slice(thisStart, thisEnd)
  var targetCopy = target.slice(start, end)

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i]
      y = targetCopy[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset
    byteOffset = 0
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000
  }
  byteOffset = +byteOffset // Coerce to Number.
  if (numberIsNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1)
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding)
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (Buffer.isBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF // Search for a byte value [0-255]
    if (typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  var indexSize = 1
  var arrLength = arr.length
  var valLength = val.length

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase()
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2
      arrLength /= 2
      valLength /= 2
      byteOffset /= 2
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i
  if (dir) {
    var foundIndex = -1
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex
        foundIndex = -1
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength
    for (i = byteOffset; i >= 0; i--) {
      var found = true
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
}

Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  var strLen = string.length

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (numberIsNaN(parsed)) return i
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function latin1Write (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset >>> 0
    if (isFinite(length)) {
      length = length >>> 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
        : (firstByte > 0xBF) ? 2
          : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + (bytes[i + 1] * 256))
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf = this.subarray(start, end)
  // Return an augmented `Uint8Array` instance
  newBuf.__proto__ = Buffer.prototype
  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset + 3] = (value >>> 24)
  this[offset + 2] = (value >>> 16)
  this[offset + 1] = (value >>> 8)
  this[offset] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  this[offset + 2] = (value >>> 16)
  this[offset + 3] = (value >>> 24)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!Buffer.isBuffer(target)) throw new TypeError('argument should be a Buffer')
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('Index out of range')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start

  if (this === target && typeof Uint8Array.prototype.copyWithin === 'function') {
    // Use built-in when available, missing from IE11
    this.copyWithin(targetStart, start, end)
  } else if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (var i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, end),
      targetStart
    )
  }

  return len
}

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = this.length
    } else if (typeof end === 'string') {
      encoding = end
      end = this.length
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0)
      if ((encoding === 'utf8' && code < 128) ||
          encoding === 'latin1') {
        // Fast path: If `val` fits into a single byte, use that numeric value.
        val = code
      }
    }
  } else if (typeof val === 'number') {
    val = val & 255
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0
  end = end === undefined ? this.length : end >>> 0

  if (!val) val = 0

  var i
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val
    }
  } else {
    var bytes = Buffer.isBuffer(val)
      ? val
      : Buffer.from(val, encoding)
    var len = bytes.length
    if (len === 0) {
      throw new TypeError('The value "' + val +
        '" is invalid for argument "value"')
    }
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node takes equal signs as end of the Base64 encoding
  str = str.split('=')[0]
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = str.trim().replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

// ArrayBuffer or Uint8Array objects from other contexts (i.e. iframes) do not pass
// the `instanceof` check but they should be treated as of that type.
// See: https://github.com/feross/buffer/issues/166
function isInstance (obj, type) {
  return obj instanceof type ||
    (obj != null && obj.constructor != null && obj.constructor.name != null &&
      obj.constructor.name === type.name)
}
function numberIsNaN (obj) {
  // For IE11 support
  return obj !== obj // eslint-disable-line no-self-compare
}

}).call(this)}).call(this,require("buffer").Buffer)
},{"base64-js":21,"buffer":36,"ieee754":48}],37:[function(require,module,exports){
'use strict';

var GetIntrinsic = require('get-intrinsic');

var callBind = require('./');

var $indexOf = callBind(GetIntrinsic('String.prototype.indexOf'));

module.exports = function callBoundIntrinsic(name, allowMissing) {
	var intrinsic = GetIntrinsic(name, !!allowMissing);
	if (typeof intrinsic === 'function' && $indexOf(name, '.prototype.') > -1) {
		return callBind(intrinsic);
	}
	return intrinsic;
};

},{"./":38,"get-intrinsic":44}],38:[function(require,module,exports){
'use strict';

var bind = require('function-bind');
var GetIntrinsic = require('get-intrinsic');

var $apply = GetIntrinsic('%Function.prototype.apply%');
var $call = GetIntrinsic('%Function.prototype.call%');
var $reflectApply = GetIntrinsic('%Reflect.apply%', true) || bind.call($call, $apply);

var $gOPD = GetIntrinsic('%Object.getOwnPropertyDescriptor%', true);
var $defineProperty = GetIntrinsic('%Object.defineProperty%', true);
var $max = GetIntrinsic('%Math.max%');

if ($defineProperty) {
	try {
		$defineProperty({}, 'a', { value: 1 });
	} catch (e) {
		// IE 8 has a broken defineProperty
		$defineProperty = null;
	}
}

module.exports = function callBind(originalFunction) {
	var func = $reflectApply(bind, $call, arguments);
	if ($gOPD && $defineProperty) {
		var desc = $gOPD(func, 'length');
		if (desc.configurable) {
			// original length, plus the receiver, minus any additional arguments (after the receiver)
			$defineProperty(
				func,
				'length',
				{ value: 1 + $max(0, originalFunction.length - (arguments.length - 1)) }
			);
		}
	}
	return func;
};

var applyBind = function applyBind() {
	return $reflectApply(bind, $apply, arguments);
};

if ($defineProperty) {
	$defineProperty(module.exports, 'apply', { value: applyBind });
} else {
	module.exports.apply = applyBind;
}

},{"function-bind":43,"get-intrinsic":44}],39:[function(require,module,exports){
'use strict';

var GetIntrinsic = require('get-intrinsic');

var $gOPD = GetIntrinsic('%Object.getOwnPropertyDescriptor%', true);
if ($gOPD) {
	try {
		$gOPD([], 'length');
	} catch (e) {
		// IE 8 has a broken gOPD
		$gOPD = null;
	}
}

module.exports = $gOPD;

},{"get-intrinsic":44}],40:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var R = typeof Reflect === 'object' ? Reflect : null
var ReflectApply = R && typeof R.apply === 'function'
  ? R.apply
  : function ReflectApply(target, receiver, args) {
    return Function.prototype.apply.call(target, receiver, args);
  }

var ReflectOwnKeys
if (R && typeof R.ownKeys === 'function') {
  ReflectOwnKeys = R.ownKeys
} else if (Object.getOwnPropertySymbols) {
  ReflectOwnKeys = function ReflectOwnKeys(target) {
    return Object.getOwnPropertyNames(target)
      .concat(Object.getOwnPropertySymbols(target));
  };
} else {
  ReflectOwnKeys = function ReflectOwnKeys(target) {
    return Object.getOwnPropertyNames(target);
  };
}

function ProcessEmitWarning(warning) {
  if (console && console.warn) console.warn(warning);
}

var NumberIsNaN = Number.isNaN || function NumberIsNaN(value) {
  return value !== value;
}

function EventEmitter() {
  EventEmitter.init.call(this);
}
module.exports = EventEmitter;
module.exports.once = once;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._eventsCount = 0;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
var defaultMaxListeners = 10;

function checkListener(listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof listener);
  }
}

Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
  enumerable: true,
  get: function() {
    return defaultMaxListeners;
  },
  set: function(arg) {
    if (typeof arg !== 'number' || arg < 0 || NumberIsNaN(arg)) {
      throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + arg + '.');
    }
    defaultMaxListeners = arg;
  }
});

EventEmitter.init = function() {

  if (this._events === undefined ||
      this._events === Object.getPrototypeOf(this)._events) {
    this._events = Object.create(null);
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
};

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || NumberIsNaN(n)) {
    throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + n + '.');
  }
  this._maxListeners = n;
  return this;
};

function _getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return _getMaxListeners(this);
};

EventEmitter.prototype.emit = function emit(type) {
  var args = [];
  for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
  var doError = (type === 'error');

  var events = this._events;
  if (events !== undefined)
    doError = (doError && events.error === undefined);
  else if (!doError)
    return false;

  // If there is no 'error' event listener then throw.
  if (doError) {
    var er;
    if (args.length > 0)
      er = args[0];
    if (er instanceof Error) {
      // Note: The comments on the `throw` lines are intentional, they show
      // up in Node's output if this results in an unhandled exception.
      throw er; // Unhandled 'error' event
    }
    // At least give some kind of context to the user
    var err = new Error('Unhandled error.' + (er ? ' (' + er.message + ')' : ''));
    err.context = er;
    throw err; // Unhandled 'error' event
  }

  var handler = events[type];

  if (handler === undefined)
    return false;

  if (typeof handler === 'function') {
    ReflectApply(handler, this, args);
  } else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      ReflectApply(listeners[i], this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  checkListener(listener);

  events = target._events;
  if (events === undefined) {
    events = target._events = Object.create(null);
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener !== undefined) {
      target.emit('newListener', type,
                  listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (existing === undefined) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] =
        prepend ? [listener, existing] : [existing, listener];
      // If we've already got an array, just append.
    } else if (prepend) {
      existing.unshift(listener);
    } else {
      existing.push(listener);
    }

    // Check for listener leak
    m = _getMaxListeners(target);
    if (m > 0 && existing.length > m && !existing.warned) {
      existing.warned = true;
      // No error code for this since it is a Warning
      // eslint-disable-next-line no-restricted-syntax
      var w = new Error('Possible EventEmitter memory leak detected. ' +
                          existing.length + ' ' + String(type) + ' listeners ' +
                          'added. Use emitter.setMaxListeners() to ' +
                          'increase limit');
      w.name = 'MaxListenersExceededWarning';
      w.emitter = target;
      w.type = type;
      w.count = existing.length;
      ProcessEmitWarning(w);
    }
  }

  return target;
}

EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function onceWrapper() {
  if (!this.fired) {
    this.target.removeListener(this.type, this.wrapFn);
    this.fired = true;
    if (arguments.length === 0)
      return this.listener.call(this.target);
    return this.listener.apply(this.target, arguments);
  }
}

function _onceWrap(target, type, listener) {
  var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
  var wrapped = onceWrapper.bind(state);
  wrapped.listener = listener;
  state.wrapFn = wrapped;
  return wrapped;
}

EventEmitter.prototype.once = function once(type, listener) {
  checkListener(listener);
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      checkListener(listener);
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// Emits a 'removeListener' event if and only if the listener was removed.
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      checkListener(listener);

      events = this._events;
      if (events === undefined)
        return this;

      list = events[type];
      if (list === undefined)
        return this;

      if (list === listener || list.listener === listener) {
        if (--this._eventsCount === 0)
          this._events = Object.create(null);
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length - 1; i >= 0; i--) {
          if (list[i] === listener || list[i].listener === listener) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (position === 0)
          list.shift();
        else {
          spliceOne(list, position);
        }

        if (list.length === 1)
          events[type] = list[0];

        if (events.removeListener !== undefined)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };

EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events, i;

      events = this._events;
      if (events === undefined)
        return this;

      // not listening for removeListener, no need to emit
      if (events.removeListener === undefined) {
        if (arguments.length === 0) {
          this._events = Object.create(null);
          this._eventsCount = 0;
        } else if (events[type] !== undefined) {
          if (--this._eventsCount === 0)
            this._events = Object.create(null);
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = Object.keys(events);
        var key;
        for (i = 0; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = Object.create(null);
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners !== undefined) {
        // LIFO order
        for (i = listeners.length - 1; i >= 0; i--) {
          this.removeListener(type, listeners[i]);
        }
      }

      return this;
    };

function _listeners(target, type, unwrap) {
  var events = target._events;

  if (events === undefined)
    return [];

  var evlistener = events[type];
  if (evlistener === undefined)
    return [];

  if (typeof evlistener === 'function')
    return unwrap ? [evlistener.listener || evlistener] : [evlistener];

  return unwrap ?
    unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
}

EventEmitter.prototype.listeners = function listeners(type) {
  return _listeners(this, type, true);
};

EventEmitter.prototype.rawListeners = function rawListeners(type) {
  return _listeners(this, type, false);
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events !== undefined) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener !== undefined) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? ReflectOwnKeys(this._events) : [];
};

function arrayClone(arr, n) {
  var copy = new Array(n);
  for (var i = 0; i < n; ++i)
    copy[i] = arr[i];
  return copy;
}

function spliceOne(list, index) {
  for (; index + 1 < list.length; index++)
    list[index] = list[index + 1];
  list.pop();
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

function once(emitter, name) {
  return new Promise(function (resolve, reject) {
    function eventListener() {
      if (errorListener !== undefined) {
        emitter.removeListener('error', errorListener);
      }
      resolve([].slice.call(arguments));
    };
    var errorListener;

    // Adding an error listener is not optional because
    // if an error is thrown on an event emitter we cannot
    // guarantee that the actual event we are waiting will
    // be fired. The result could be a silent way to create
    // memory or file descriptor leaks, which is something
    // we should avoid.
    if (name !== 'error') {
      errorListener = function errorListener(err) {
        emitter.removeListener(name, eventListener);
        reject(err);
      };

      emitter.once('error', errorListener);
    }

    emitter.once(name, eventListener);
  });
}

},{}],41:[function(require,module,exports){

var hasOwn = Object.prototype.hasOwnProperty;
var toString = Object.prototype.toString;

module.exports = function forEach (obj, fn, ctx) {
    if (toString.call(fn) !== '[object Function]') {
        throw new TypeError('iterator must be a function');
    }
    var l = obj.length;
    if (l === +l) {
        for (var i = 0; i < l; i++) {
            fn.call(ctx, obj[i], i, obj);
        }
    } else {
        for (var k in obj) {
            if (hasOwn.call(obj, k)) {
                fn.call(ctx, obj[k], k, obj);
            }
        }
    }
};


},{}],42:[function(require,module,exports){
'use strict';

/* eslint no-invalid-this: 1 */

var ERROR_MESSAGE = 'Function.prototype.bind called on incompatible ';
var slice = Array.prototype.slice;
var toStr = Object.prototype.toString;
var funcType = '[object Function]';

module.exports = function bind(that) {
    var target = this;
    if (typeof target !== 'function' || toStr.call(target) !== funcType) {
        throw new TypeError(ERROR_MESSAGE + target);
    }
    var args = slice.call(arguments, 1);

    var bound;
    var binder = function () {
        if (this instanceof bound) {
            var result = target.apply(
                this,
                args.concat(slice.call(arguments))
            );
            if (Object(result) === result) {
                return result;
            }
            return this;
        } else {
            return target.apply(
                that,
                args.concat(slice.call(arguments))
            );
        }
    };

    var boundLength = Math.max(0, target.length - args.length);
    var boundArgs = [];
    for (var i = 0; i < boundLength; i++) {
        boundArgs.push('$' + i);
    }

    bound = Function('binder', 'return function (' + boundArgs.join(',') + '){ return binder.apply(this,arguments); }')(binder);

    if (target.prototype) {
        var Empty = function Empty() {};
        Empty.prototype = target.prototype;
        bound.prototype = new Empty();
        Empty.prototype = null;
    }

    return bound;
};

},{}],43:[function(require,module,exports){
'use strict';

var implementation = require('./implementation');

module.exports = Function.prototype.bind || implementation;

},{"./implementation":42}],44:[function(require,module,exports){
'use strict';

var undefined;

var $SyntaxError = SyntaxError;
var $Function = Function;
var $TypeError = TypeError;

// eslint-disable-next-line consistent-return
var getEvalledConstructor = function (expressionSyntax) {
	try {
		return $Function('"use strict"; return (' + expressionSyntax + ').constructor;')();
	} catch (e) {}
};

var $gOPD = Object.getOwnPropertyDescriptor;
if ($gOPD) {
	try {
		$gOPD({}, '');
	} catch (e) {
		$gOPD = null; // this is IE 8, which has a broken gOPD
	}
}

var throwTypeError = function () {
	throw new $TypeError();
};
var ThrowTypeError = $gOPD
	? (function () {
		try {
			// eslint-disable-next-line no-unused-expressions, no-caller, no-restricted-properties
			arguments.callee; // IE 8 does not throw here
			return throwTypeError;
		} catch (calleeThrows) {
			try {
				// IE 8 throws on Object.getOwnPropertyDescriptor(arguments, '')
				return $gOPD(arguments, 'callee').get;
			} catch (gOPDthrows) {
				return throwTypeError;
			}
		}
	}())
	: throwTypeError;

var hasSymbols = require('has-symbols')();

var getProto = Object.getPrototypeOf || function (x) { return x.__proto__; }; // eslint-disable-line no-proto

var needsEval = {};

var TypedArray = typeof Uint8Array === 'undefined' ? undefined : getProto(Uint8Array);

var INTRINSICS = {
	'%AggregateError%': typeof AggregateError === 'undefined' ? undefined : AggregateError,
	'%Array%': Array,
	'%ArrayBuffer%': typeof ArrayBuffer === 'undefined' ? undefined : ArrayBuffer,
	'%ArrayIteratorPrototype%': hasSymbols ? getProto([][Symbol.iterator]()) : undefined,
	'%AsyncFromSyncIteratorPrototype%': undefined,
	'%AsyncFunction%': needsEval,
	'%AsyncGenerator%': needsEval,
	'%AsyncGeneratorFunction%': needsEval,
	'%AsyncIteratorPrototype%': needsEval,
	'%Atomics%': typeof Atomics === 'undefined' ? undefined : Atomics,
	'%BigInt%': typeof BigInt === 'undefined' ? undefined : BigInt,
	'%Boolean%': Boolean,
	'%DataView%': typeof DataView === 'undefined' ? undefined : DataView,
	'%Date%': Date,
	'%decodeURI%': decodeURI,
	'%decodeURIComponent%': decodeURIComponent,
	'%encodeURI%': encodeURI,
	'%encodeURIComponent%': encodeURIComponent,
	'%Error%': Error,
	'%eval%': eval, // eslint-disable-line no-eval
	'%EvalError%': EvalError,
	'%Float32Array%': typeof Float32Array === 'undefined' ? undefined : Float32Array,
	'%Float64Array%': typeof Float64Array === 'undefined' ? undefined : Float64Array,
	'%FinalizationRegistry%': typeof FinalizationRegistry === 'undefined' ? undefined : FinalizationRegistry,
	'%Function%': $Function,
	'%GeneratorFunction%': needsEval,
	'%Int8Array%': typeof Int8Array === 'undefined' ? undefined : Int8Array,
	'%Int16Array%': typeof Int16Array === 'undefined' ? undefined : Int16Array,
	'%Int32Array%': typeof Int32Array === 'undefined' ? undefined : Int32Array,
	'%isFinite%': isFinite,
	'%isNaN%': isNaN,
	'%IteratorPrototype%': hasSymbols ? getProto(getProto([][Symbol.iterator]())) : undefined,
	'%JSON%': typeof JSON === 'object' ? JSON : undefined,
	'%Map%': typeof Map === 'undefined' ? undefined : Map,
	'%MapIteratorPrototype%': typeof Map === 'undefined' || !hasSymbols ? undefined : getProto(new Map()[Symbol.iterator]()),
	'%Math%': Math,
	'%Number%': Number,
	'%Object%': Object,
	'%parseFloat%': parseFloat,
	'%parseInt%': parseInt,
	'%Promise%': typeof Promise === 'undefined' ? undefined : Promise,
	'%Proxy%': typeof Proxy === 'undefined' ? undefined : Proxy,
	'%RangeError%': RangeError,
	'%ReferenceError%': ReferenceError,
	'%Reflect%': typeof Reflect === 'undefined' ? undefined : Reflect,
	'%RegExp%': RegExp,
	'%Set%': typeof Set === 'undefined' ? undefined : Set,
	'%SetIteratorPrototype%': typeof Set === 'undefined' || !hasSymbols ? undefined : getProto(new Set()[Symbol.iterator]()),
	'%SharedArrayBuffer%': typeof SharedArrayBuffer === 'undefined' ? undefined : SharedArrayBuffer,
	'%String%': String,
	'%StringIteratorPrototype%': hasSymbols ? getProto(''[Symbol.iterator]()) : undefined,
	'%Symbol%': hasSymbols ? Symbol : undefined,
	'%SyntaxError%': $SyntaxError,
	'%ThrowTypeError%': ThrowTypeError,
	'%TypedArray%': TypedArray,
	'%TypeError%': $TypeError,
	'%Uint8Array%': typeof Uint8Array === 'undefined' ? undefined : Uint8Array,
	'%Uint8ClampedArray%': typeof Uint8ClampedArray === 'undefined' ? undefined : Uint8ClampedArray,
	'%Uint16Array%': typeof Uint16Array === 'undefined' ? undefined : Uint16Array,
	'%Uint32Array%': typeof Uint32Array === 'undefined' ? undefined : Uint32Array,
	'%URIError%': URIError,
	'%WeakMap%': typeof WeakMap === 'undefined' ? undefined : WeakMap,
	'%WeakRef%': typeof WeakRef === 'undefined' ? undefined : WeakRef,
	'%WeakSet%': typeof WeakSet === 'undefined' ? undefined : WeakSet
};

var doEval = function doEval(name) {
	var value;
	if (name === '%AsyncFunction%') {
		value = getEvalledConstructor('async function () {}');
	} else if (name === '%GeneratorFunction%') {
		value = getEvalledConstructor('function* () {}');
	} else if (name === '%AsyncGeneratorFunction%') {
		value = getEvalledConstructor('async function* () {}');
	} else if (name === '%AsyncGenerator%') {
		var fn = doEval('%AsyncGeneratorFunction%');
		if (fn) {
			value = fn.prototype;
		}
	} else if (name === '%AsyncIteratorPrototype%') {
		var gen = doEval('%AsyncGenerator%');
		if (gen) {
			value = getProto(gen.prototype);
		}
	}

	INTRINSICS[name] = value;

	return value;
};

var LEGACY_ALIASES = {
	'%ArrayBufferPrototype%': ['ArrayBuffer', 'prototype'],
	'%ArrayPrototype%': ['Array', 'prototype'],
	'%ArrayProto_entries%': ['Array', 'prototype', 'entries'],
	'%ArrayProto_forEach%': ['Array', 'prototype', 'forEach'],
	'%ArrayProto_keys%': ['Array', 'prototype', 'keys'],
	'%ArrayProto_values%': ['Array', 'prototype', 'values'],
	'%AsyncFunctionPrototype%': ['AsyncFunction', 'prototype'],
	'%AsyncGenerator%': ['AsyncGeneratorFunction', 'prototype'],
	'%AsyncGeneratorPrototype%': ['AsyncGeneratorFunction', 'prototype', 'prototype'],
	'%BooleanPrototype%': ['Boolean', 'prototype'],
	'%DataViewPrototype%': ['DataView', 'prototype'],
	'%DatePrototype%': ['Date', 'prototype'],
	'%ErrorPrototype%': ['Error', 'prototype'],
	'%EvalErrorPrototype%': ['EvalError', 'prototype'],
	'%Float32ArrayPrototype%': ['Float32Array', 'prototype'],
	'%Float64ArrayPrototype%': ['Float64Array', 'prototype'],
	'%FunctionPrototype%': ['Function', 'prototype'],
	'%Generator%': ['GeneratorFunction', 'prototype'],
	'%GeneratorPrototype%': ['GeneratorFunction', 'prototype', 'prototype'],
	'%Int8ArrayPrototype%': ['Int8Array', 'prototype'],
	'%Int16ArrayPrototype%': ['Int16Array', 'prototype'],
	'%Int32ArrayPrototype%': ['Int32Array', 'prototype'],
	'%JSONParse%': ['JSON', 'parse'],
	'%JSONStringify%': ['JSON', 'stringify'],
	'%MapPrototype%': ['Map', 'prototype'],
	'%NumberPrototype%': ['Number', 'prototype'],
	'%ObjectPrototype%': ['Object', 'prototype'],
	'%ObjProto_toString%': ['Object', 'prototype', 'toString'],
	'%ObjProto_valueOf%': ['Object', 'prototype', 'valueOf'],
	'%PromisePrototype%': ['Promise', 'prototype'],
	'%PromiseProto_then%': ['Promise', 'prototype', 'then'],
	'%Promise_all%': ['Promise', 'all'],
	'%Promise_reject%': ['Promise', 'reject'],
	'%Promise_resolve%': ['Promise', 'resolve'],
	'%RangeErrorPrototype%': ['RangeError', 'prototype'],
	'%ReferenceErrorPrototype%': ['ReferenceError', 'prototype'],
	'%RegExpPrototype%': ['RegExp', 'prototype'],
	'%SetPrototype%': ['Set', 'prototype'],
	'%SharedArrayBufferPrototype%': ['SharedArrayBuffer', 'prototype'],
	'%StringPrototype%': ['String', 'prototype'],
	'%SymbolPrototype%': ['Symbol', 'prototype'],
	'%SyntaxErrorPrototype%': ['SyntaxError', 'prototype'],
	'%TypedArrayPrototype%': ['TypedArray', 'prototype'],
	'%TypeErrorPrototype%': ['TypeError', 'prototype'],
	'%Uint8ArrayPrototype%': ['Uint8Array', 'prototype'],
	'%Uint8ClampedArrayPrototype%': ['Uint8ClampedArray', 'prototype'],
	'%Uint16ArrayPrototype%': ['Uint16Array', 'prototype'],
	'%Uint32ArrayPrototype%': ['Uint32Array', 'prototype'],
	'%URIErrorPrototype%': ['URIError', 'prototype'],
	'%WeakMapPrototype%': ['WeakMap', 'prototype'],
	'%WeakSetPrototype%': ['WeakSet', 'prototype']
};

var bind = require('function-bind');
var hasOwn = require('has');
var $concat = bind.call(Function.call, Array.prototype.concat);
var $spliceApply = bind.call(Function.apply, Array.prototype.splice);
var $replace = bind.call(Function.call, String.prototype.replace);
var $strSlice = bind.call(Function.call, String.prototype.slice);
var $exec = bind.call(Function.call, RegExp.prototype.exec);

/* adapted from https://github.com/lodash/lodash/blob/4.17.15/dist/lodash.js#L6735-L6744 */
var rePropName = /[^%.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|%$))/g;
var reEscapeChar = /\\(\\)?/g; /** Used to match backslashes in property paths. */
var stringToPath = function stringToPath(string) {
	var first = $strSlice(string, 0, 1);
	var last = $strSlice(string, -1);
	if (first === '%' && last !== '%') {
		throw new $SyntaxError('invalid intrinsic syntax, expected closing `%`');
	} else if (last === '%' && first !== '%') {
		throw new $SyntaxError('invalid intrinsic syntax, expected opening `%`');
	}
	var result = [];
	$replace(string, rePropName, function (match, number, quote, subString) {
		result[result.length] = quote ? $replace(subString, reEscapeChar, '$1') : number || match;
	});
	return result;
};
/* end adaptation */

var getBaseIntrinsic = function getBaseIntrinsic(name, allowMissing) {
	var intrinsicName = name;
	var alias;
	if (hasOwn(LEGACY_ALIASES, intrinsicName)) {
		alias = LEGACY_ALIASES[intrinsicName];
		intrinsicName = '%' + alias[0] + '%';
	}

	if (hasOwn(INTRINSICS, intrinsicName)) {
		var value = INTRINSICS[intrinsicName];
		if (value === needsEval) {
			value = doEval(intrinsicName);
		}
		if (typeof value === 'undefined' && !allowMissing) {
			throw new $TypeError('intrinsic ' + name + ' exists, but is not available. Please file an issue!');
		}

		return {
			alias: alias,
			name: intrinsicName,
			value: value
		};
	}

	throw new $SyntaxError('intrinsic ' + name + ' does not exist!');
};

module.exports = function GetIntrinsic(name, allowMissing) {
	if (typeof name !== 'string' || name.length === 0) {
		throw new $TypeError('intrinsic name must be a non-empty string');
	}
	if (arguments.length > 1 && typeof allowMissing !== 'boolean') {
		throw new $TypeError('"allowMissing" argument must be a boolean');
	}

	if ($exec(/^%?[^%]*%?$/g, name) === null) {
		throw new $SyntaxError('`%` may not be present anywhere but at the beginning and end of the intrinsic name');
	}
	var parts = stringToPath(name);
	var intrinsicBaseName = parts.length > 0 ? parts[0] : '';

	var intrinsic = getBaseIntrinsic('%' + intrinsicBaseName + '%', allowMissing);
	var intrinsicRealName = intrinsic.name;
	var value = intrinsic.value;
	var skipFurtherCaching = false;

	var alias = intrinsic.alias;
	if (alias) {
		intrinsicBaseName = alias[0];
		$spliceApply(parts, $concat([0, 1], alias));
	}

	for (var i = 1, isOwn = true; i < parts.length; i += 1) {
		var part = parts[i];
		var first = $strSlice(part, 0, 1);
		var last = $strSlice(part, -1);
		if (
			(
				(first === '"' || first === "'" || first === '`')
				|| (last === '"' || last === "'" || last === '`')
			)
			&& first !== last
		) {
			throw new $SyntaxError('property names with quotes must have matching quotes');
		}
		if (part === 'constructor' || !isOwn) {
			skipFurtherCaching = true;
		}

		intrinsicBaseName += '.' + part;
		intrinsicRealName = '%' + intrinsicBaseName + '%';

		if (hasOwn(INTRINSICS, intrinsicRealName)) {
			value = INTRINSICS[intrinsicRealName];
		} else if (value != null) {
			if (!(part in value)) {
				if (!allowMissing) {
					throw new $TypeError('base intrinsic for ' + name + ' exists, but the property is not available.');
				}
				return void undefined;
			}
			if ($gOPD && (i + 1) >= parts.length) {
				var desc = $gOPD(value, part);
				isOwn = !!desc;

				// By convention, when a data property is converted to an accessor
				// property to emulate a data property that does not suffer from
				// the override mistake, that accessor's getter is marked with
				// an `originalValue` property. Here, when we detect this, we
				// uphold the illusion by pretending to see that original data
				// property, i.e., returning the value rather than the getter
				// itself.
				if (isOwn && 'get' in desc && !('originalValue' in desc.get)) {
					value = desc.get;
				} else {
					value = value[part];
				}
			} else {
				isOwn = hasOwn(value, part);
				value = value[part];
			}

			if (isOwn && !skipFurtherCaching) {
				INTRINSICS[intrinsicRealName] = value;
			}
		}
	}
	return value;
};

},{"function-bind":43,"has":47,"has-symbols":45}],45:[function(require,module,exports){
'use strict';

var origSymbol = typeof Symbol !== 'undefined' && Symbol;
var hasSymbolSham = require('./shams');

module.exports = function hasNativeSymbols() {
	if (typeof origSymbol !== 'function') { return false; }
	if (typeof Symbol !== 'function') { return false; }
	if (typeof origSymbol('foo') !== 'symbol') { return false; }
	if (typeof Symbol('bar') !== 'symbol') { return false; }

	return hasSymbolSham();
};

},{"./shams":46}],46:[function(require,module,exports){
'use strict';

/* eslint complexity: [2, 18], max-statements: [2, 33] */
module.exports = function hasSymbols() {
	if (typeof Symbol !== 'function' || typeof Object.getOwnPropertySymbols !== 'function') { return false; }
	if (typeof Symbol.iterator === 'symbol') { return true; }

	var obj = {};
	var sym = Symbol('test');
	var symObj = Object(sym);
	if (typeof sym === 'string') { return false; }

	if (Object.prototype.toString.call(sym) !== '[object Symbol]') { return false; }
	if (Object.prototype.toString.call(symObj) !== '[object Symbol]') { return false; }

	// temp disabled per https://github.com/ljharb/object.assign/issues/17
	// if (sym instanceof Symbol) { return false; }
	// temp disabled per https://github.com/WebReflection/get-own-property-symbols/issues/4
	// if (!(symObj instanceof Symbol)) { return false; }

	// if (typeof Symbol.prototype.toString !== 'function') { return false; }
	// if (String(sym) !== Symbol.prototype.toString.call(sym)) { return false; }

	var symVal = 42;
	obj[sym] = symVal;
	for (sym in obj) { return false; } // eslint-disable-line no-restricted-syntax, no-unreachable-loop
	if (typeof Object.keys === 'function' && Object.keys(obj).length !== 0) { return false; }

	if (typeof Object.getOwnPropertyNames === 'function' && Object.getOwnPropertyNames(obj).length !== 0) { return false; }

	var syms = Object.getOwnPropertySymbols(obj);
	if (syms.length !== 1 || syms[0] !== sym) { return false; }

	if (!Object.prototype.propertyIsEnumerable.call(obj, sym)) { return false; }

	if (typeof Object.getOwnPropertyDescriptor === 'function') {
		var descriptor = Object.getOwnPropertyDescriptor(obj, sym);
		if (descriptor.value !== symVal || descriptor.enumerable !== true) { return false; }
	}

	return true;
};

},{}],47:[function(require,module,exports){
'use strict';

var bind = require('function-bind');

module.exports = bind.call(Function.call, Object.prototype.hasOwnProperty);

},{"function-bind":43}],48:[function(require,module,exports){
/*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> */
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = (e * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = (m * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = ((value * c) - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],49:[function(require,module,exports){
arguments[4][17][0].apply(exports,arguments)
},{"dup":17}],50:[function(require,module,exports){
'use strict';

var hasToStringTag = typeof Symbol === 'function' && typeof Symbol.toStringTag === 'symbol';
var callBound = require('call-bind/callBound');

var $toString = callBound('Object.prototype.toString');

var isStandardArguments = function isArguments(value) {
	if (hasToStringTag && value && typeof value === 'object' && Symbol.toStringTag in value) {
		return false;
	}
	return $toString(value) === '[object Arguments]';
};

var isLegacyArguments = function isArguments(value) {
	if (isStandardArguments(value)) {
		return true;
	}
	return value !== null &&
		typeof value === 'object' &&
		typeof value.length === 'number' &&
		value.length >= 0 &&
		$toString(value) !== '[object Array]' &&
		$toString(value.callee) === '[object Function]';
};

var supportsStandardArguments = (function () {
	return isStandardArguments(arguments);
}());

isStandardArguments.isLegacyArguments = isLegacyArguments; // for tests

module.exports = supportsStandardArguments ? isStandardArguments : isLegacyArguments;

},{"call-bind/callBound":37}],51:[function(require,module,exports){
'use strict';

var toStr = Object.prototype.toString;
var fnToStr = Function.prototype.toString;
var isFnRegex = /^\s*(?:function)?\*/;
var hasToStringTag = typeof Symbol === 'function' && typeof Symbol.toStringTag === 'symbol';
var getProto = Object.getPrototypeOf;
var getGeneratorFunc = function () { // eslint-disable-line consistent-return
	if (!hasToStringTag) {
		return false;
	}
	try {
		return Function('return function*() {}')();
	} catch (e) {
	}
};
var generatorFunc = getGeneratorFunc();
var GeneratorFunction = getProto && generatorFunc ? getProto(generatorFunc) : false;

module.exports = function isGeneratorFunction(fn) {
	if (typeof fn !== 'function') {
		return false;
	}
	if (isFnRegex.test(fnToStr.call(fn))) {
		return true;
	}
	if (!hasToStringTag) {
		var str = toStr.call(fn);
		return str === '[object GeneratorFunction]';
	}
	return getProto && getProto(fn) === GeneratorFunction;
};

},{}],52:[function(require,module,exports){
(function (global){(function (){
'use strict';

var forEach = require('foreach');
var availableTypedArrays = require('available-typed-arrays');
var callBound = require('call-bind/callBound');

var $toString = callBound('Object.prototype.toString');
var hasSymbols = require('has-symbols')();
var hasToStringTag = hasSymbols && typeof Symbol.toStringTag === 'symbol';

var typedArrays = availableTypedArrays();

var $indexOf = callBound('Array.prototype.indexOf', true) || function indexOf(array, value) {
	for (var i = 0; i < array.length; i += 1) {
		if (array[i] === value) {
			return i;
		}
	}
	return -1;
};
var $slice = callBound('String.prototype.slice');
var toStrTags = {};
var gOPD = require('es-abstract/helpers/getOwnPropertyDescriptor');
var getPrototypeOf = Object.getPrototypeOf; // require('getprototypeof');
if (hasToStringTag && gOPD && getPrototypeOf) {
	forEach(typedArrays, function (typedArray) {
		var arr = new global[typedArray]();
		if (!(Symbol.toStringTag in arr)) {
			throw new EvalError('this engine has support for Symbol.toStringTag, but ' + typedArray + ' does not have the property! Please report this.');
		}
		var proto = getPrototypeOf(arr);
		var descriptor = gOPD(proto, Symbol.toStringTag);
		if (!descriptor) {
			var superProto = getPrototypeOf(proto);
			descriptor = gOPD(superProto, Symbol.toStringTag);
		}
		toStrTags[typedArray] = descriptor.get;
	});
}

var tryTypedArrays = function tryAllTypedArrays(value) {
	var anyTrue = false;
	forEach(toStrTags, function (getter, typedArray) {
		if (!anyTrue) {
			try {
				anyTrue = getter.call(value) === typedArray;
			} catch (e) { /**/ }
		}
	});
	return anyTrue;
};

module.exports = function isTypedArray(value) {
	if (!value || typeof value !== 'object') { return false; }
	if (!hasToStringTag) {
		var tag = $slice($toString(value), 8, -1);
		return $indexOf(typedArrays, tag) > -1;
	}
	if (!gOPD) { return false; }
	return tryTypedArrays(value);
};

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"available-typed-arrays":20,"call-bind/callBound":37,"es-abstract/helpers/getOwnPropertyDescriptor":39,"foreach":41,"has-symbols":45}],53:[function(require,module,exports){
/*
object-assign
(c) Sindre Sorhus
@license MIT
*/

'use strict';
/* eslint-disable no-unused-vars */
var getOwnPropertySymbols = Object.getOwnPropertySymbols;
var hasOwnProperty = Object.prototype.hasOwnProperty;
var propIsEnumerable = Object.prototype.propertyIsEnumerable;

function toObject(val) {
	if (val === null || val === undefined) {
		throw new TypeError('Object.assign cannot be called with null or undefined');
	}

	return Object(val);
}

function shouldUseNative() {
	try {
		if (!Object.assign) {
			return false;
		}

		// Detect buggy property enumeration order in older V8 versions.

		// https://bugs.chromium.org/p/v8/issues/detail?id=4118
		var test1 = new String('abc');  // eslint-disable-line no-new-wrappers
		test1[5] = 'de';
		if (Object.getOwnPropertyNames(test1)[0] === '5') {
			return false;
		}

		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
		var test2 = {};
		for (var i = 0; i < 10; i++) {
			test2['_' + String.fromCharCode(i)] = i;
		}
		var order2 = Object.getOwnPropertyNames(test2).map(function (n) {
			return test2[n];
		});
		if (order2.join('') !== '0123456789') {
			return false;
		}

		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
		var test3 = {};
		'abcdefghijklmnopqrst'.split('').forEach(function (letter) {
			test3[letter] = letter;
		});
		if (Object.keys(Object.assign({}, test3)).join('') !==
				'abcdefghijklmnopqrst') {
			return false;
		}

		return true;
	} catch (err) {
		// We don't expect any of the above to throw, but better to be safe.
		return false;
	}
}

module.exports = shouldUseNative() ? Object.assign : function (target, source) {
	var from;
	var to = toObject(target);
	var symbols;

	for (var s = 1; s < arguments.length; s++) {
		from = Object(arguments[s]);

		for (var key in from) {
			if (hasOwnProperty.call(from, key)) {
				to[key] = from[key];
			}
		}

		if (getOwnPropertySymbols) {
			symbols = getOwnPropertySymbols(from);
			for (var i = 0; i < symbols.length; i++) {
				if (propIsEnumerable.call(from, symbols[i])) {
					to[symbols[i]] = from[symbols[i]];
				}
			}
		}
	}

	return to;
};

},{}],54:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],55:[function(require,module,exports){
/* eslint-disable node/no-deprecated-api */
var buffer = require('buffer')
var Buffer = buffer.Buffer

// alternative to using Object.keys for old browsers
function copyProps (src, dst) {
  for (var key in src) {
    dst[key] = src[key]
  }
}
if (Buffer.from && Buffer.alloc && Buffer.allocUnsafe && Buffer.allocUnsafeSlow) {
  module.exports = buffer
} else {
  // Copy properties from require('buffer')
  copyProps(buffer, exports)
  exports.Buffer = SafeBuffer
}

function SafeBuffer (arg, encodingOrOffset, length) {
  return Buffer(arg, encodingOrOffset, length)
}

// Copy static methods from Buffer
copyProps(Buffer, SafeBuffer)

SafeBuffer.from = function (arg, encodingOrOffset, length) {
  if (typeof arg === 'number') {
    throw new TypeError('Argument must not be a number')
  }
  return Buffer(arg, encodingOrOffset, length)
}

SafeBuffer.alloc = function (size, fill, encoding) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  var buf = Buffer(size)
  if (fill !== undefined) {
    if (typeof encoding === 'string') {
      buf.fill(fill, encoding)
    } else {
      buf.fill(fill)
    }
  } else {
    buf.fill(0)
  }
  return buf
}

SafeBuffer.allocUnsafe = function (size) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  return Buffer(size)
}

SafeBuffer.allocUnsafeSlow = function (size) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  return buffer.SlowBuffer(size)
}

},{"buffer":36}],56:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Stream;

var EE = require('events').EventEmitter;
var inherits = require('inherits');

inherits(Stream, EE);
Stream.Readable = require('readable-stream/lib/_stream_readable.js');
Stream.Writable = require('readable-stream/lib/_stream_writable.js');
Stream.Duplex = require('readable-stream/lib/_stream_duplex.js');
Stream.Transform = require('readable-stream/lib/_stream_transform.js');
Stream.PassThrough = require('readable-stream/lib/_stream_passthrough.js');
Stream.finished = require('readable-stream/lib/internal/streams/end-of-stream.js')
Stream.pipeline = require('readable-stream/lib/internal/streams/pipeline.js')

// Backwards-compat with node 0.4.x
Stream.Stream = Stream;



// old-style streams.  Note that the pipe method (the only relevant
// part of this class) is overridden in the Readable class.

function Stream() {
  EE.call(this);
}

Stream.prototype.pipe = function(dest, options) {
  var source = this;

  function ondata(chunk) {
    if (dest.writable) {
      if (false === dest.write(chunk) && source.pause) {
        source.pause();
      }
    }
  }

  source.on('data', ondata);

  function ondrain() {
    if (source.readable && source.resume) {
      source.resume();
    }
  }

  dest.on('drain', ondrain);

  // If the 'end' option is not supplied, dest.end() will be called when
  // source gets the 'end' or 'close' events.  Only dest.end() once.
  if (!dest._isStdio && (!options || options.end !== false)) {
    source.on('end', onend);
    source.on('close', onclose);
  }

  var didOnEnd = false;
  function onend() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest.end();
  }


  function onclose() {
    if (didOnEnd) return;
    didOnEnd = true;

    if (typeof dest.destroy === 'function') dest.destroy();
  }

  // don't leave dangling pipes when there are errors.
  function onerror(er) {
    cleanup();
    if (EE.listenerCount(this, 'error') === 0) {
      throw er; // Unhandled stream error in pipe.
    }
  }

  source.on('error', onerror);
  dest.on('error', onerror);

  // remove all the event listeners that were added.
  function cleanup() {
    source.removeListener('data', ondata);
    dest.removeListener('drain', ondrain);

    source.removeListener('end', onend);
    source.removeListener('close', onclose);

    source.removeListener('error', onerror);
    dest.removeListener('error', onerror);

    source.removeListener('end', cleanup);
    source.removeListener('close', cleanup);

    dest.removeListener('close', cleanup);
  }

  source.on('end', cleanup);
  source.on('close', cleanup);

  dest.on('close', cleanup);

  dest.emit('pipe', source);

  // Allow for unix-like usage: A.pipe(B).pipe(C)
  return dest;
};

},{"events":40,"inherits":57,"readable-stream/lib/_stream_duplex.js":59,"readable-stream/lib/_stream_passthrough.js":60,"readable-stream/lib/_stream_readable.js":61,"readable-stream/lib/_stream_transform.js":62,"readable-stream/lib/_stream_writable.js":63,"readable-stream/lib/internal/streams/end-of-stream.js":67,"readable-stream/lib/internal/streams/pipeline.js":69}],57:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    if (superCtor) {
      ctor.super_ = superCtor
      ctor.prototype = Object.create(superCtor.prototype, {
        constructor: {
          value: ctor,
          enumerable: false,
          writable: true,
          configurable: true
        }
      })
    }
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    if (superCtor) {
      ctor.super_ = superCtor
      var TempCtor = function () {}
      TempCtor.prototype = superCtor.prototype
      ctor.prototype = new TempCtor()
      ctor.prototype.constructor = ctor
    }
  }
}

},{}],58:[function(require,module,exports){
'use strict';

function _inheritsLoose(subClass, superClass) { subClass.prototype = Object.create(superClass.prototype); subClass.prototype.constructor = subClass; subClass.__proto__ = superClass; }

var codes = {};

function createErrorType(code, message, Base) {
  if (!Base) {
    Base = Error;
  }

  function getMessage(arg1, arg2, arg3) {
    if (typeof message === 'string') {
      return message;
    } else {
      return message(arg1, arg2, arg3);
    }
  }

  var NodeError =
  /*#__PURE__*/
  function (_Base) {
    _inheritsLoose(NodeError, _Base);

    function NodeError(arg1, arg2, arg3) {
      return _Base.call(this, getMessage(arg1, arg2, arg3)) || this;
    }

    return NodeError;
  }(Base);

  NodeError.prototype.name = Base.name;
  NodeError.prototype.code = code;
  codes[code] = NodeError;
} // https://github.com/nodejs/node/blob/v10.8.0/lib/internal/errors.js


function oneOf(expected, thing) {
  if (Array.isArray(expected)) {
    var len = expected.length;
    expected = expected.map(function (i) {
      return String(i);
    });

    if (len > 2) {
      return "one of ".concat(thing, " ").concat(expected.slice(0, len - 1).join(', '), ", or ") + expected[len - 1];
    } else if (len === 2) {
      return "one of ".concat(thing, " ").concat(expected[0], " or ").concat(expected[1]);
    } else {
      return "of ".concat(thing, " ").concat(expected[0]);
    }
  } else {
    return "of ".concat(thing, " ").concat(String(expected));
  }
} // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/startsWith


function startsWith(str, search, pos) {
  return str.substr(!pos || pos < 0 ? 0 : +pos, search.length) === search;
} // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/endsWith


function endsWith(str, search, this_len) {
  if (this_len === undefined || this_len > str.length) {
    this_len = str.length;
  }

  return str.substring(this_len - search.length, this_len) === search;
} // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/includes


function includes(str, search, start) {
  if (typeof start !== 'number') {
    start = 0;
  }

  if (start + search.length > str.length) {
    return false;
  } else {
    return str.indexOf(search, start) !== -1;
  }
}

createErrorType('ERR_INVALID_OPT_VALUE', function (name, value) {
  return 'The value "' + value + '" is invalid for option "' + name + '"';
}, TypeError);
createErrorType('ERR_INVALID_ARG_TYPE', function (name, expected, actual) {
  // determiner: 'must be' or 'must not be'
  var determiner;

  if (typeof expected === 'string' && startsWith(expected, 'not ')) {
    determiner = 'must not be';
    expected = expected.replace(/^not /, '');
  } else {
    determiner = 'must be';
  }

  var msg;

  if (endsWith(name, ' argument')) {
    // For cases like 'first argument'
    msg = "The ".concat(name, " ").concat(determiner, " ").concat(oneOf(expected, 'type'));
  } else {
    var type = includes(name, '.') ? 'property' : 'argument';
    msg = "The \"".concat(name, "\" ").concat(type, " ").concat(determiner, " ").concat(oneOf(expected, 'type'));
  }

  msg += ". Received type ".concat(typeof actual);
  return msg;
}, TypeError);
createErrorType('ERR_STREAM_PUSH_AFTER_EOF', 'stream.push() after EOF');
createErrorType('ERR_METHOD_NOT_IMPLEMENTED', function (name) {
  return 'The ' + name + ' method is not implemented';
});
createErrorType('ERR_STREAM_PREMATURE_CLOSE', 'Premature close');
createErrorType('ERR_STREAM_DESTROYED', function (name) {
  return 'Cannot call ' + name + ' after a stream was destroyed';
});
createErrorType('ERR_MULTIPLE_CALLBACK', 'Callback called multiple times');
createErrorType('ERR_STREAM_CANNOT_PIPE', 'Cannot pipe, not readable');
createErrorType('ERR_STREAM_WRITE_AFTER_END', 'write after end');
createErrorType('ERR_STREAM_NULL_VALUES', 'May not write null values to stream', TypeError);
createErrorType('ERR_UNKNOWN_ENCODING', function (arg) {
  return 'Unknown encoding: ' + arg;
}, TypeError);
createErrorType('ERR_STREAM_UNSHIFT_AFTER_END_EVENT', 'stream.unshift() after end event');
module.exports.codes = codes;

},{}],59:[function(require,module,exports){
(function (process){(function (){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
// a duplex stream is just a stream that is both readable and writable.
// Since JS doesn't have multiple prototypal inheritance, this class
// prototypally inherits from Readable, and then parasitically from
// Writable.
'use strict';
/*<replacement>*/

var objectKeys = Object.keys || function (obj) {
  var keys = [];

  for (var key in obj) {
    keys.push(key);
  }

  return keys;
};
/*</replacement>*/


module.exports = Duplex;

var Readable = require('./_stream_readable');

var Writable = require('./_stream_writable');

require('inherits')(Duplex, Readable);

{
  // Allow the keys array to be GC'ed.
  var keys = objectKeys(Writable.prototype);

  for (var v = 0; v < keys.length; v++) {
    var method = keys[v];
    if (!Duplex.prototype[method]) Duplex.prototype[method] = Writable.prototype[method];
  }
}

function Duplex(options) {
  if (!(this instanceof Duplex)) return new Duplex(options);
  Readable.call(this, options);
  Writable.call(this, options);
  this.allowHalfOpen = true;

  if (options) {
    if (options.readable === false) this.readable = false;
    if (options.writable === false) this.writable = false;

    if (options.allowHalfOpen === false) {
      this.allowHalfOpen = false;
      this.once('end', onend);
    }
  }
}

Object.defineProperty(Duplex.prototype, 'writableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState.highWaterMark;
  }
});
Object.defineProperty(Duplex.prototype, 'writableBuffer', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState && this._writableState.getBuffer();
  }
});
Object.defineProperty(Duplex.prototype, 'writableLength', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState.length;
  }
}); // the no-half-open enforcer

function onend() {
  // If the writable side ended, then we're ok.
  if (this._writableState.ended) return; // no more data can be written.
  // But allow more writes to happen in this tick.

  process.nextTick(onEndNT, this);
}

function onEndNT(self) {
  self.end();
}

Object.defineProperty(Duplex.prototype, 'destroyed', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    if (this._readableState === undefined || this._writableState === undefined) {
      return false;
    }

    return this._readableState.destroyed && this._writableState.destroyed;
  },
  set: function set(value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (this._readableState === undefined || this._writableState === undefined) {
      return;
    } // backward compatibility, the user is explicitly
    // managing destroyed


    this._readableState.destroyed = value;
    this._writableState.destroyed = value;
  }
});
}).call(this)}).call(this,require('_process'))
},{"./_stream_readable":61,"./_stream_writable":63,"_process":54,"inherits":57}],60:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
// a passthrough stream.
// basically just the most minimal sort of Transform stream.
// Every written chunk gets output as-is.
'use strict';

module.exports = PassThrough;

var Transform = require('./_stream_transform');

require('inherits')(PassThrough, Transform);

function PassThrough(options) {
  if (!(this instanceof PassThrough)) return new PassThrough(options);
  Transform.call(this, options);
}

PassThrough.prototype._transform = function (chunk, encoding, cb) {
  cb(null, chunk);
};
},{"./_stream_transform":62,"inherits":57}],61:[function(require,module,exports){
(function (process,global){(function (){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
'use strict';

module.exports = Readable;
/*<replacement>*/

var Duplex;
/*</replacement>*/

Readable.ReadableState = ReadableState;
/*<replacement>*/

var EE = require('events').EventEmitter;

var EElistenerCount = function EElistenerCount(emitter, type) {
  return emitter.listeners(type).length;
};
/*</replacement>*/

/*<replacement>*/


var Stream = require('./internal/streams/stream');
/*</replacement>*/


var Buffer = require('buffer').Buffer;

var OurUint8Array = global.Uint8Array || function () {};

function _uint8ArrayToBuffer(chunk) {
  return Buffer.from(chunk);
}

function _isUint8Array(obj) {
  return Buffer.isBuffer(obj) || obj instanceof OurUint8Array;
}
/*<replacement>*/


var debugUtil = require('util');

var debug;

if (debugUtil && debugUtil.debuglog) {
  debug = debugUtil.debuglog('stream');
} else {
  debug = function debug() {};
}
/*</replacement>*/


var BufferList = require('./internal/streams/buffer_list');

var destroyImpl = require('./internal/streams/destroy');

var _require = require('./internal/streams/state'),
    getHighWaterMark = _require.getHighWaterMark;

var _require$codes = require('../errors').codes,
    ERR_INVALID_ARG_TYPE = _require$codes.ERR_INVALID_ARG_TYPE,
    ERR_STREAM_PUSH_AFTER_EOF = _require$codes.ERR_STREAM_PUSH_AFTER_EOF,
    ERR_METHOD_NOT_IMPLEMENTED = _require$codes.ERR_METHOD_NOT_IMPLEMENTED,
    ERR_STREAM_UNSHIFT_AFTER_END_EVENT = _require$codes.ERR_STREAM_UNSHIFT_AFTER_END_EVENT; // Lazy loaded to improve the startup performance.


var StringDecoder;
var createReadableStreamAsyncIterator;
var from;

require('inherits')(Readable, Stream);

var errorOrDestroy = destroyImpl.errorOrDestroy;
var kProxyEvents = ['error', 'close', 'destroy', 'pause', 'resume'];

function prependListener(emitter, event, fn) {
  // Sadly this is not cacheable as some libraries bundle their own
  // event emitter implementation with them.
  if (typeof emitter.prependListener === 'function') return emitter.prependListener(event, fn); // This is a hack to make sure that our error handler is attached before any
  // userland ones.  NEVER DO THIS. This is here only because this code needs
  // to continue to work with older versions of Node.js that do not include
  // the prependListener() method. The goal is to eventually remove this hack.

  if (!emitter._events || !emitter._events[event]) emitter.on(event, fn);else if (Array.isArray(emitter._events[event])) emitter._events[event].unshift(fn);else emitter._events[event] = [fn, emitter._events[event]];
}

function ReadableState(options, stream, isDuplex) {
  Duplex = Duplex || require('./_stream_duplex');
  options = options || {}; // Duplex streams are both readable and writable, but share
  // the same options object.
  // However, some cases require setting options to different
  // values for the readable and the writable sides of the duplex stream.
  // These options can be provided separately as readableXXX and writableXXX.

  if (typeof isDuplex !== 'boolean') isDuplex = stream instanceof Duplex; // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away

  this.objectMode = !!options.objectMode;
  if (isDuplex) this.objectMode = this.objectMode || !!options.readableObjectMode; // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"

  this.highWaterMark = getHighWaterMark(this, options, 'readableHighWaterMark', isDuplex); // A linked list is used to store data chunks instead of an array because the
  // linked list can remove elements from the beginning faster than
  // array.shift()

  this.buffer = new BufferList();
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = null;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false; // a flag to be able to tell if the event 'readable'/'data' is emitted
  // immediately, or on a later tick.  We set this to true at first, because
  // any actions that shouldn't happen until "later" should generally also
  // not happen before the first read call.

  this.sync = true; // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.

  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;
  this.resumeScheduled = false;
  this.paused = true; // Should close be emitted on destroy. Defaults to true.

  this.emitClose = options.emitClose !== false; // Should .destroy() be called after 'end' (and potentially 'finish')

  this.autoDestroy = !!options.autoDestroy; // has it been destroyed

  this.destroyed = false; // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.

  this.defaultEncoding = options.defaultEncoding || 'utf8'; // the number of writers that are awaiting a drain event in .pipe()s

  this.awaitDrain = 0; // if true, a maybeReadMore has been scheduled

  this.readingMore = false;
  this.decoder = null;
  this.encoding = null;

  if (options.encoding) {
    if (!StringDecoder) StringDecoder = require('string_decoder/').StringDecoder;
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}

function Readable(options) {
  Duplex = Duplex || require('./_stream_duplex');
  if (!(this instanceof Readable)) return new Readable(options); // Checking for a Stream.Duplex instance is faster here instead of inside
  // the ReadableState constructor, at least with V8 6.5

  var isDuplex = this instanceof Duplex;
  this._readableState = new ReadableState(options, this, isDuplex); // legacy

  this.readable = true;

  if (options) {
    if (typeof options.read === 'function') this._read = options.read;
    if (typeof options.destroy === 'function') this._destroy = options.destroy;
  }

  Stream.call(this);
}

Object.defineProperty(Readable.prototype, 'destroyed', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    if (this._readableState === undefined) {
      return false;
    }

    return this._readableState.destroyed;
  },
  set: function set(value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (!this._readableState) {
      return;
    } // backward compatibility, the user is explicitly
    // managing destroyed


    this._readableState.destroyed = value;
  }
});
Readable.prototype.destroy = destroyImpl.destroy;
Readable.prototype._undestroy = destroyImpl.undestroy;

Readable.prototype._destroy = function (err, cb) {
  cb(err);
}; // Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.


Readable.prototype.push = function (chunk, encoding) {
  var state = this._readableState;
  var skipChunkCheck;

  if (!state.objectMode) {
    if (typeof chunk === 'string') {
      encoding = encoding || state.defaultEncoding;

      if (encoding !== state.encoding) {
        chunk = Buffer.from(chunk, encoding);
        encoding = '';
      }

      skipChunkCheck = true;
    }
  } else {
    skipChunkCheck = true;
  }

  return readableAddChunk(this, chunk, encoding, false, skipChunkCheck);
}; // Unshift should *always* be something directly out of read()


Readable.prototype.unshift = function (chunk) {
  return readableAddChunk(this, chunk, null, true, false);
};

function readableAddChunk(stream, chunk, encoding, addToFront, skipChunkCheck) {
  debug('readableAddChunk', chunk);
  var state = stream._readableState;

  if (chunk === null) {
    state.reading = false;
    onEofChunk(stream, state);
  } else {
    var er;
    if (!skipChunkCheck) er = chunkInvalid(state, chunk);

    if (er) {
      errorOrDestroy(stream, er);
    } else if (state.objectMode || chunk && chunk.length > 0) {
      if (typeof chunk !== 'string' && !state.objectMode && Object.getPrototypeOf(chunk) !== Buffer.prototype) {
        chunk = _uint8ArrayToBuffer(chunk);
      }

      if (addToFront) {
        if (state.endEmitted) errorOrDestroy(stream, new ERR_STREAM_UNSHIFT_AFTER_END_EVENT());else addChunk(stream, state, chunk, true);
      } else if (state.ended) {
        errorOrDestroy(stream, new ERR_STREAM_PUSH_AFTER_EOF());
      } else if (state.destroyed) {
        return false;
      } else {
        state.reading = false;

        if (state.decoder && !encoding) {
          chunk = state.decoder.write(chunk);
          if (state.objectMode || chunk.length !== 0) addChunk(stream, state, chunk, false);else maybeReadMore(stream, state);
        } else {
          addChunk(stream, state, chunk, false);
        }
      }
    } else if (!addToFront) {
      state.reading = false;
      maybeReadMore(stream, state);
    }
  } // We can push more data if we are below the highWaterMark.
  // Also, if we have no data yet, we can stand some more bytes.
  // This is to work around cases where hwm=0, such as the repl.


  return !state.ended && (state.length < state.highWaterMark || state.length === 0);
}

function addChunk(stream, state, chunk, addToFront) {
  if (state.flowing && state.length === 0 && !state.sync) {
    state.awaitDrain = 0;
    stream.emit('data', chunk);
  } else {
    // update the buffer info.
    state.length += state.objectMode ? 1 : chunk.length;
    if (addToFront) state.buffer.unshift(chunk);else state.buffer.push(chunk);
    if (state.needReadable) emitReadable(stream);
  }

  maybeReadMore(stream, state);
}

function chunkInvalid(state, chunk) {
  var er;

  if (!_isUint8Array(chunk) && typeof chunk !== 'string' && chunk !== undefined && !state.objectMode) {
    er = new ERR_INVALID_ARG_TYPE('chunk', ['string', 'Buffer', 'Uint8Array'], chunk);
  }

  return er;
}

Readable.prototype.isPaused = function () {
  return this._readableState.flowing === false;
}; // backwards compatibility.


Readable.prototype.setEncoding = function (enc) {
  if (!StringDecoder) StringDecoder = require('string_decoder/').StringDecoder;
  var decoder = new StringDecoder(enc);
  this._readableState.decoder = decoder; // If setEncoding(null), decoder.encoding equals utf8

  this._readableState.encoding = this._readableState.decoder.encoding; // Iterate over current buffer to convert already stored Buffers:

  var p = this._readableState.buffer.head;
  var content = '';

  while (p !== null) {
    content += decoder.write(p.data);
    p = p.next;
  }

  this._readableState.buffer.clear();

  if (content !== '') this._readableState.buffer.push(content);
  this._readableState.length = content.length;
  return this;
}; // Don't raise the hwm > 1GB


var MAX_HWM = 0x40000000;

function computeNewHighWaterMark(n) {
  if (n >= MAX_HWM) {
    // TODO(ronag): Throw ERR_VALUE_OUT_OF_RANGE.
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2 to prevent increasing hwm excessively in
    // tiny amounts
    n--;
    n |= n >>> 1;
    n |= n >>> 2;
    n |= n >>> 4;
    n |= n >>> 8;
    n |= n >>> 16;
    n++;
  }

  return n;
} // This function is designed to be inlinable, so please take care when making
// changes to the function body.


function howMuchToRead(n, state) {
  if (n <= 0 || state.length === 0 && state.ended) return 0;
  if (state.objectMode) return 1;

  if (n !== n) {
    // Only flow one buffer at a time
    if (state.flowing && state.length) return state.buffer.head.data.length;else return state.length;
  } // If we're asking for more than the current hwm, then raise the hwm.


  if (n > state.highWaterMark) state.highWaterMark = computeNewHighWaterMark(n);
  if (n <= state.length) return n; // Don't have enough

  if (!state.ended) {
    state.needReadable = true;
    return 0;
  }

  return state.length;
} // you can override either this method, or the async _read(n) below.


Readable.prototype.read = function (n) {
  debug('read', n);
  n = parseInt(n, 10);
  var state = this._readableState;
  var nOrig = n;
  if (n !== 0) state.emittedReadable = false; // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.

  if (n === 0 && state.needReadable && ((state.highWaterMark !== 0 ? state.length >= state.highWaterMark : state.length > 0) || state.ended)) {
    debug('read: emitReadable', state.length, state.ended);
    if (state.length === 0 && state.ended) endReadable(this);else emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state); // if we've ended, and we're now clear, then finish it up.

  if (n === 0 && state.ended) {
    if (state.length === 0) endReadable(this);
    return null;
  } // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.
  // if we need a readable event, then we need to do some reading.


  var doRead = state.needReadable;
  debug('need readable', doRead); // if we currently have less than the highWaterMark, then also read some

  if (state.length === 0 || state.length - n < state.highWaterMark) {
    doRead = true;
    debug('length less than watermark', doRead);
  } // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.


  if (state.ended || state.reading) {
    doRead = false;
    debug('reading or ended', doRead);
  } else if (doRead) {
    debug('do read');
    state.reading = true;
    state.sync = true; // if the length is currently zero, then we *need* a readable event.

    if (state.length === 0) state.needReadable = true; // call internal read method

    this._read(state.highWaterMark);

    state.sync = false; // If _read pushed data synchronously, then `reading` will be false,
    // and we need to re-evaluate how much data we can return to the user.

    if (!state.reading) n = howMuchToRead(nOrig, state);
  }

  var ret;
  if (n > 0) ret = fromList(n, state);else ret = null;

  if (ret === null) {
    state.needReadable = state.length <= state.highWaterMark;
    n = 0;
  } else {
    state.length -= n;
    state.awaitDrain = 0;
  }

  if (state.length === 0) {
    // If we have nothing in the buffer, then we want to know
    // as soon as we *do* get something into the buffer.
    if (!state.ended) state.needReadable = true; // If we tried to read() past the EOF, then emit end on the next tick.

    if (nOrig !== n && state.ended) endReadable(this);
  }

  if (ret !== null) this.emit('data', ret);
  return ret;
};

function onEofChunk(stream, state) {
  debug('onEofChunk');
  if (state.ended) return;

  if (state.decoder) {
    var chunk = state.decoder.end();

    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }

  state.ended = true;

  if (state.sync) {
    // if we are sync, wait until next tick to emit the data.
    // Otherwise we risk emitting data in the flow()
    // the readable code triggers during a read() call
    emitReadable(stream);
  } else {
    // emit 'readable' now to make sure it gets picked up.
    state.needReadable = false;

    if (!state.emittedReadable) {
      state.emittedReadable = true;
      emitReadable_(stream);
    }
  }
} // Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.


function emitReadable(stream) {
  var state = stream._readableState;
  debug('emitReadable', state.needReadable, state.emittedReadable);
  state.needReadable = false;

  if (!state.emittedReadable) {
    debug('emitReadable', state.flowing);
    state.emittedReadable = true;
    process.nextTick(emitReadable_, stream);
  }
}

function emitReadable_(stream) {
  var state = stream._readableState;
  debug('emitReadable_', state.destroyed, state.length, state.ended);

  if (!state.destroyed && (state.length || state.ended)) {
    stream.emit('readable');
    state.emittedReadable = false;
  } // The stream needs another readable event if
  // 1. It is not flowing, as the flow mechanism will take
  //    care of it.
  // 2. It is not ended.
  // 3. It is below the highWaterMark, so we can schedule
  //    another readable later.


  state.needReadable = !state.flowing && !state.ended && state.length <= state.highWaterMark;
  flow(stream);
} // at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.


function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    process.nextTick(maybeReadMore_, stream, state);
  }
}

function maybeReadMore_(stream, state) {
  // Attempt to read more data if we should.
  //
  // The conditions for reading more data are (one of):
  // - Not enough data buffered (state.length < state.highWaterMark). The loop
  //   is responsible for filling the buffer with enough data if such data
  //   is available. If highWaterMark is 0 and we are not in the flowing mode
  //   we should _not_ attempt to buffer any extra data. We'll get more data
  //   when the stream consumer calls read() instead.
  // - No data in the buffer, and the stream is in flowing mode. In this mode
  //   the loop below is responsible for ensuring read() is called. Failing to
  //   call read here would abort the flow and there's no other mechanism for
  //   continuing the flow if the stream consumer has just subscribed to the
  //   'data' event.
  //
  // In addition to the above conditions to keep reading data, the following
  // conditions prevent the data from being read:
  // - The stream has ended (state.ended).
  // - There is already a pending 'read' operation (state.reading). This is a
  //   case where the the stream has called the implementation defined _read()
  //   method, but they are processing the call asynchronously and have _not_
  //   called push() with new data. In this case we skip performing more
  //   read()s. The execution ends in this method again after the _read() ends
  //   up calling push() with more data.
  while (!state.reading && !state.ended && (state.length < state.highWaterMark || state.flowing && state.length === 0)) {
    var len = state.length;
    debug('maybeReadMore read 0');
    stream.read(0);
    if (len === state.length) // didn't get any data, stop spinning.
      break;
  }

  state.readingMore = false;
} // abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.


Readable.prototype._read = function (n) {
  errorOrDestroy(this, new ERR_METHOD_NOT_IMPLEMENTED('_read()'));
};

Readable.prototype.pipe = function (dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;

    case 1:
      state.pipes = [state.pipes, dest];
      break;

    default:
      state.pipes.push(dest);
      break;
  }

  state.pipesCount += 1;
  debug('pipe count=%d opts=%j', state.pipesCount, pipeOpts);
  var doEnd = (!pipeOpts || pipeOpts.end !== false) && dest !== process.stdout && dest !== process.stderr;
  var endFn = doEnd ? onend : unpipe;
  if (state.endEmitted) process.nextTick(endFn);else src.once('end', endFn);
  dest.on('unpipe', onunpipe);

  function onunpipe(readable, unpipeInfo) {
    debug('onunpipe');

    if (readable === src) {
      if (unpipeInfo && unpipeInfo.hasUnpiped === false) {
        unpipeInfo.hasUnpiped = true;
        cleanup();
      }
    }
  }

  function onend() {
    debug('onend');
    dest.end();
  } // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.


  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);
  var cleanedUp = false;

  function cleanup() {
    debug('cleanup'); // cleanup event handlers once the pipe is broken

    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', unpipe);
    src.removeListener('data', ondata);
    cleanedUp = true; // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.

    if (state.awaitDrain && (!dest._writableState || dest._writableState.needDrain)) ondrain();
  }

  src.on('data', ondata);

  function ondata(chunk) {
    debug('ondata');
    var ret = dest.write(chunk);
    debug('dest.write', ret);

    if (ret === false) {
      // If the user unpiped during `dest.write()`, it is possible
      // to get stuck in a permanently paused state if that write
      // also returned false.
      // => Check whether `dest` is still a piping destination.
      if ((state.pipesCount === 1 && state.pipes === dest || state.pipesCount > 1 && indexOf(state.pipes, dest) !== -1) && !cleanedUp) {
        debug('false write response, pause', state.awaitDrain);
        state.awaitDrain++;
      }

      src.pause();
    }
  } // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.


  function onerror(er) {
    debug('onerror', er);
    unpipe();
    dest.removeListener('error', onerror);
    if (EElistenerCount(dest, 'error') === 0) errorOrDestroy(dest, er);
  } // Make sure our error handler is attached before userland ones.


  prependListener(dest, 'error', onerror); // Both close and finish should trigger unpipe, but only once.

  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }

  dest.once('close', onclose);

  function onfinish() {
    debug('onfinish');
    dest.removeListener('close', onclose);
    unpipe();
  }

  dest.once('finish', onfinish);

  function unpipe() {
    debug('unpipe');
    src.unpipe(dest);
  } // tell the dest that it's being piped to


  dest.emit('pipe', src); // start the flow if it hasn't been started already.

  if (!state.flowing) {
    debug('pipe resume');
    src.resume();
  }

  return dest;
};

function pipeOnDrain(src) {
  return function pipeOnDrainFunctionResult() {
    var state = src._readableState;
    debug('pipeOnDrain', state.awaitDrain);
    if (state.awaitDrain) state.awaitDrain--;

    if (state.awaitDrain === 0 && EElistenerCount(src, 'data')) {
      state.flowing = true;
      flow(src);
    }
  };
}

Readable.prototype.unpipe = function (dest) {
  var state = this._readableState;
  var unpipeInfo = {
    hasUnpiped: false
  }; // if we're not piping anywhere, then do nothing.

  if (state.pipesCount === 0) return this; // just one destination.  most common case.

  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes) return this;
    if (!dest) dest = state.pipes; // got a match.

    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;
    if (dest) dest.emit('unpipe', this, unpipeInfo);
    return this;
  } // slow case. multiple pipe destinations.


  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;

    for (var i = 0; i < len; i++) {
      dests[i].emit('unpipe', this, {
        hasUnpiped: false
      });
    }

    return this;
  } // try to find the right one.


  var index = indexOf(state.pipes, dest);
  if (index === -1) return this;
  state.pipes.splice(index, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1) state.pipes = state.pipes[0];
  dest.emit('unpipe', this, unpipeInfo);
  return this;
}; // set up data events if they are asked for
// Ensure readable listeners eventually get something


Readable.prototype.on = function (ev, fn) {
  var res = Stream.prototype.on.call(this, ev, fn);
  var state = this._readableState;

  if (ev === 'data') {
    // update readableListening so that resume() may be a no-op
    // a few lines down. This is needed to support once('readable').
    state.readableListening = this.listenerCount('readable') > 0; // Try start flowing on next tick if stream isn't explicitly paused

    if (state.flowing !== false) this.resume();
  } else if (ev === 'readable') {
    if (!state.endEmitted && !state.readableListening) {
      state.readableListening = state.needReadable = true;
      state.flowing = false;
      state.emittedReadable = false;
      debug('on readable', state.length, state.reading);

      if (state.length) {
        emitReadable(this);
      } else if (!state.reading) {
        process.nextTick(nReadingNextTick, this);
      }
    }
  }

  return res;
};

Readable.prototype.addListener = Readable.prototype.on;

Readable.prototype.removeListener = function (ev, fn) {
  var res = Stream.prototype.removeListener.call(this, ev, fn);

  if (ev === 'readable') {
    // We need to check if there is someone still listening to
    // readable and reset the state. However this needs to happen
    // after readable has been emitted but before I/O (nextTick) to
    // support once('readable', fn) cycles. This means that calling
    // resume within the same tick will have no
    // effect.
    process.nextTick(updateReadableListening, this);
  }

  return res;
};

Readable.prototype.removeAllListeners = function (ev) {
  var res = Stream.prototype.removeAllListeners.apply(this, arguments);

  if (ev === 'readable' || ev === undefined) {
    // We need to check if there is someone still listening to
    // readable and reset the state. However this needs to happen
    // after readable has been emitted but before I/O (nextTick) to
    // support once('readable', fn) cycles. This means that calling
    // resume within the same tick will have no
    // effect.
    process.nextTick(updateReadableListening, this);
  }

  return res;
};

function updateReadableListening(self) {
  var state = self._readableState;
  state.readableListening = self.listenerCount('readable') > 0;

  if (state.resumeScheduled && !state.paused) {
    // flowing needs to be set to true now, otherwise
    // the upcoming resume will not flow.
    state.flowing = true; // crude way to check if we should resume
  } else if (self.listenerCount('data') > 0) {
    self.resume();
  }
}

function nReadingNextTick(self) {
  debug('readable nexttick read 0');
  self.read(0);
} // pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.


Readable.prototype.resume = function () {
  var state = this._readableState;

  if (!state.flowing) {
    debug('resume'); // we flow only if there is no one listening
    // for readable, but we still have to call
    // resume()

    state.flowing = !state.readableListening;
    resume(this, state);
  }

  state.paused = false;
  return this;
};

function resume(stream, state) {
  if (!state.resumeScheduled) {
    state.resumeScheduled = true;
    process.nextTick(resume_, stream, state);
  }
}

function resume_(stream, state) {
  debug('resume', state.reading);

  if (!state.reading) {
    stream.read(0);
  }

  state.resumeScheduled = false;
  stream.emit('resume');
  flow(stream);
  if (state.flowing && !state.reading) stream.read(0);
}

Readable.prototype.pause = function () {
  debug('call pause flowing=%j', this._readableState.flowing);

  if (this._readableState.flowing !== false) {
    debug('pause');
    this._readableState.flowing = false;
    this.emit('pause');
  }

  this._readableState.paused = true;
  return this;
};

function flow(stream) {
  var state = stream._readableState;
  debug('flow', state.flowing);

  while (state.flowing && stream.read() !== null) {
    ;
  }
} // wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.


Readable.prototype.wrap = function (stream) {
  var _this = this;

  var state = this._readableState;
  var paused = false;
  stream.on('end', function () {
    debug('wrapped end');

    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length) _this.push(chunk);
    }

    _this.push(null);
  });
  stream.on('data', function (chunk) {
    debug('wrapped data');
    if (state.decoder) chunk = state.decoder.write(chunk); // don't skip over falsy values in objectMode

    if (state.objectMode && (chunk === null || chunk === undefined)) return;else if (!state.objectMode && (!chunk || !chunk.length)) return;

    var ret = _this.push(chunk);

    if (!ret) {
      paused = true;
      stream.pause();
    }
  }); // proxy all the other methods.
  // important when wrapping filters and duplexes.

  for (var i in stream) {
    if (this[i] === undefined && typeof stream[i] === 'function') {
      this[i] = function methodWrap(method) {
        return function methodWrapReturnFunction() {
          return stream[method].apply(stream, arguments);
        };
      }(i);
    }
  } // proxy certain important events.


  for (var n = 0; n < kProxyEvents.length; n++) {
    stream.on(kProxyEvents[n], this.emit.bind(this, kProxyEvents[n]));
  } // when we try to consume some more bytes, simply unpause the
  // underlying stream.


  this._read = function (n) {
    debug('wrapped _read', n);

    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return this;
};

if (typeof Symbol === 'function') {
  Readable.prototype[Symbol.asyncIterator] = function () {
    if (createReadableStreamAsyncIterator === undefined) {
      createReadableStreamAsyncIterator = require('./internal/streams/async_iterator');
    }

    return createReadableStreamAsyncIterator(this);
  };
}

Object.defineProperty(Readable.prototype, 'readableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._readableState.highWaterMark;
  }
});
Object.defineProperty(Readable.prototype, 'readableBuffer', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._readableState && this._readableState.buffer;
  }
});
Object.defineProperty(Readable.prototype, 'readableFlowing', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._readableState.flowing;
  },
  set: function set(state) {
    if (this._readableState) {
      this._readableState.flowing = state;
    }
  }
}); // exposed for testing purposes only.

Readable._fromList = fromList;
Object.defineProperty(Readable.prototype, 'readableLength', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._readableState.length;
  }
}); // Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.

function fromList(n, state) {
  // nothing buffered
  if (state.length === 0) return null;
  var ret;
  if (state.objectMode) ret = state.buffer.shift();else if (!n || n >= state.length) {
    // read it all, truncate the list
    if (state.decoder) ret = state.buffer.join('');else if (state.buffer.length === 1) ret = state.buffer.first();else ret = state.buffer.concat(state.length);
    state.buffer.clear();
  } else {
    // read part of list
    ret = state.buffer.consume(n, state.decoder);
  }
  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;
  debug('endReadable', state.endEmitted);

  if (!state.endEmitted) {
    state.ended = true;
    process.nextTick(endReadableNT, state, stream);
  }
}

function endReadableNT(state, stream) {
  debug('endReadableNT', state.endEmitted, state.length); // Check that we didn't get one last unshift.

  if (!state.endEmitted && state.length === 0) {
    state.endEmitted = true;
    stream.readable = false;
    stream.emit('end');

    if (state.autoDestroy) {
      // In case of duplex streams we need a way to detect
      // if the writable side is ready for autoDestroy as well
      var wState = stream._writableState;

      if (!wState || wState.autoDestroy && wState.finished) {
        stream.destroy();
      }
    }
  }
}

if (typeof Symbol === 'function') {
  Readable.from = function (iterable, opts) {
    if (from === undefined) {
      from = require('./internal/streams/from');
    }

    return from(Readable, iterable, opts);
  };
}

function indexOf(xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }

  return -1;
}
}).call(this)}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../errors":58,"./_stream_duplex":59,"./internal/streams/async_iterator":64,"./internal/streams/buffer_list":65,"./internal/streams/destroy":66,"./internal/streams/from":68,"./internal/streams/state":70,"./internal/streams/stream":71,"_process":54,"buffer":36,"events":40,"inherits":57,"string_decoder/":72,"util":22}],62:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.
'use strict';

module.exports = Transform;

var _require$codes = require('../errors').codes,
    ERR_METHOD_NOT_IMPLEMENTED = _require$codes.ERR_METHOD_NOT_IMPLEMENTED,
    ERR_MULTIPLE_CALLBACK = _require$codes.ERR_MULTIPLE_CALLBACK,
    ERR_TRANSFORM_ALREADY_TRANSFORMING = _require$codes.ERR_TRANSFORM_ALREADY_TRANSFORMING,
    ERR_TRANSFORM_WITH_LENGTH_0 = _require$codes.ERR_TRANSFORM_WITH_LENGTH_0;

var Duplex = require('./_stream_duplex');

require('inherits')(Transform, Duplex);

function afterTransform(er, data) {
  var ts = this._transformState;
  ts.transforming = false;
  var cb = ts.writecb;

  if (cb === null) {
    return this.emit('error', new ERR_MULTIPLE_CALLBACK());
  }

  ts.writechunk = null;
  ts.writecb = null;
  if (data != null) // single equals check for both `null` and `undefined`
    this.push(data);
  cb(er);
  var rs = this._readableState;
  rs.reading = false;

  if (rs.needReadable || rs.length < rs.highWaterMark) {
    this._read(rs.highWaterMark);
  }
}

function Transform(options) {
  if (!(this instanceof Transform)) return new Transform(options);
  Duplex.call(this, options);
  this._transformState = {
    afterTransform: afterTransform.bind(this),
    needTransform: false,
    transforming: false,
    writecb: null,
    writechunk: null,
    writeencoding: null
  }; // start out asking for a readable event once data is transformed.

  this._readableState.needReadable = true; // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.

  this._readableState.sync = false;

  if (options) {
    if (typeof options.transform === 'function') this._transform = options.transform;
    if (typeof options.flush === 'function') this._flush = options.flush;
  } // When the writable side finishes, then flush out anything remaining.


  this.on('prefinish', prefinish);
}

function prefinish() {
  var _this = this;

  if (typeof this._flush === 'function' && !this._readableState.destroyed) {
    this._flush(function (er, data) {
      done(_this, er, data);
    });
  } else {
    done(this, null, null);
  }
}

Transform.prototype.push = function (chunk, encoding) {
  this._transformState.needTransform = false;
  return Duplex.prototype.push.call(this, chunk, encoding);
}; // This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.


Transform.prototype._transform = function (chunk, encoding, cb) {
  cb(new ERR_METHOD_NOT_IMPLEMENTED('_transform()'));
};

Transform.prototype._write = function (chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;

  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform || rs.needReadable || rs.length < rs.highWaterMark) this._read(rs.highWaterMark);
  }
}; // Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.


Transform.prototype._read = function (n) {
  var ts = this._transformState;

  if (ts.writechunk !== null && !ts.transforming) {
    ts.transforming = true;

    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};

Transform.prototype._destroy = function (err, cb) {
  Duplex.prototype._destroy.call(this, err, function (err2) {
    cb(err2);
  });
};

function done(stream, er, data) {
  if (er) return stream.emit('error', er);
  if (data != null) // single equals check for both `null` and `undefined`
    stream.push(data); // TODO(BridgeAR): Write a test for these two error cases
  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided

  if (stream._writableState.length) throw new ERR_TRANSFORM_WITH_LENGTH_0();
  if (stream._transformState.transforming) throw new ERR_TRANSFORM_ALREADY_TRANSFORMING();
  return stream.push(null);
}
},{"../errors":58,"./_stream_duplex":59,"inherits":57}],63:[function(require,module,exports){
(function (process,global){(function (){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
// A bit simpler than readable streams.
// Implement an async ._write(chunk, encoding, cb), and it'll handle all
// the drain event emission and buffering.
'use strict';

module.exports = Writable;
/* <replacement> */

function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
  this.next = null;
} // It seems a linked list but it is not
// there will be only 2 of these for each stream


function CorkedRequest(state) {
  var _this = this;

  this.next = null;
  this.entry = null;

  this.finish = function () {
    onCorkedFinish(_this, state);
  };
}
/* </replacement> */

/*<replacement>*/


var Duplex;
/*</replacement>*/

Writable.WritableState = WritableState;
/*<replacement>*/

var internalUtil = {
  deprecate: require('util-deprecate')
};
/*</replacement>*/

/*<replacement>*/

var Stream = require('./internal/streams/stream');
/*</replacement>*/


var Buffer = require('buffer').Buffer;

var OurUint8Array = global.Uint8Array || function () {};

function _uint8ArrayToBuffer(chunk) {
  return Buffer.from(chunk);
}

function _isUint8Array(obj) {
  return Buffer.isBuffer(obj) || obj instanceof OurUint8Array;
}

var destroyImpl = require('./internal/streams/destroy');

var _require = require('./internal/streams/state'),
    getHighWaterMark = _require.getHighWaterMark;

var _require$codes = require('../errors').codes,
    ERR_INVALID_ARG_TYPE = _require$codes.ERR_INVALID_ARG_TYPE,
    ERR_METHOD_NOT_IMPLEMENTED = _require$codes.ERR_METHOD_NOT_IMPLEMENTED,
    ERR_MULTIPLE_CALLBACK = _require$codes.ERR_MULTIPLE_CALLBACK,
    ERR_STREAM_CANNOT_PIPE = _require$codes.ERR_STREAM_CANNOT_PIPE,
    ERR_STREAM_DESTROYED = _require$codes.ERR_STREAM_DESTROYED,
    ERR_STREAM_NULL_VALUES = _require$codes.ERR_STREAM_NULL_VALUES,
    ERR_STREAM_WRITE_AFTER_END = _require$codes.ERR_STREAM_WRITE_AFTER_END,
    ERR_UNKNOWN_ENCODING = _require$codes.ERR_UNKNOWN_ENCODING;

var errorOrDestroy = destroyImpl.errorOrDestroy;

require('inherits')(Writable, Stream);

function nop() {}

function WritableState(options, stream, isDuplex) {
  Duplex = Duplex || require('./_stream_duplex');
  options = options || {}; // Duplex streams are both readable and writable, but share
  // the same options object.
  // However, some cases require setting options to different
  // values for the readable and the writable sides of the duplex stream,
  // e.g. options.readableObjectMode vs. options.writableObjectMode, etc.

  if (typeof isDuplex !== 'boolean') isDuplex = stream instanceof Duplex; // object stream flag to indicate whether or not this stream
  // contains buffers or objects.

  this.objectMode = !!options.objectMode;
  if (isDuplex) this.objectMode = this.objectMode || !!options.writableObjectMode; // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()

  this.highWaterMark = getHighWaterMark(this, options, 'writableHighWaterMark', isDuplex); // if _final has been called

  this.finalCalled = false; // drain event flag.

  this.needDrain = false; // at the start of calling end()

  this.ending = false; // when end() has been called, and returned

  this.ended = false; // when 'finish' is emitted

  this.finished = false; // has it been destroyed

  this.destroyed = false; // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.

  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode; // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.

  this.defaultEncoding = options.defaultEncoding || 'utf8'; // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.

  this.length = 0; // a flag to see when we're in the middle of a write.

  this.writing = false; // when true all writes will be buffered until .uncork() call

  this.corked = 0; // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.

  this.sync = true; // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.

  this.bufferProcessing = false; // the callback that's passed to _write(chunk,cb)

  this.onwrite = function (er) {
    onwrite(stream, er);
  }; // the callback that the user supplies to write(chunk,encoding,cb)


  this.writecb = null; // the amount that is being written when _write is called.

  this.writelen = 0;
  this.bufferedRequest = null;
  this.lastBufferedRequest = null; // number of pending user-supplied write callbacks
  // this must be 0 before 'finish' can be emitted

  this.pendingcb = 0; // emit prefinish if the only thing we're waiting for is _write cbs
  // This is relevant for synchronous Transform streams

  this.prefinished = false; // True if the error was already emitted and should not be thrown again

  this.errorEmitted = false; // Should close be emitted on destroy. Defaults to true.

  this.emitClose = options.emitClose !== false; // Should .destroy() be called after 'finish' (and potentially 'end')

  this.autoDestroy = !!options.autoDestroy; // count buffered requests

  this.bufferedRequestCount = 0; // allocate the first CorkedRequest, there is always
  // one allocated and free to use, and we maintain at most two

  this.corkedRequestsFree = new CorkedRequest(this);
}

WritableState.prototype.getBuffer = function getBuffer() {
  var current = this.bufferedRequest;
  var out = [];

  while (current) {
    out.push(current);
    current = current.next;
  }

  return out;
};

(function () {
  try {
    Object.defineProperty(WritableState.prototype, 'buffer', {
      get: internalUtil.deprecate(function writableStateBufferGetter() {
        return this.getBuffer();
      }, '_writableState.buffer is deprecated. Use _writableState.getBuffer ' + 'instead.', 'DEP0003')
    });
  } catch (_) {}
})(); // Test _writableState for inheritance to account for Duplex streams,
// whose prototype chain only points to Readable.


var realHasInstance;

if (typeof Symbol === 'function' && Symbol.hasInstance && typeof Function.prototype[Symbol.hasInstance] === 'function') {
  realHasInstance = Function.prototype[Symbol.hasInstance];
  Object.defineProperty(Writable, Symbol.hasInstance, {
    value: function value(object) {
      if (realHasInstance.call(this, object)) return true;
      if (this !== Writable) return false;
      return object && object._writableState instanceof WritableState;
    }
  });
} else {
  realHasInstance = function realHasInstance(object) {
    return object instanceof this;
  };
}

function Writable(options) {
  Duplex = Duplex || require('./_stream_duplex'); // Writable ctor is applied to Duplexes, too.
  // `realHasInstance` is necessary because using plain `instanceof`
  // would return false, as no `_writableState` property is attached.
  // Trying to use the custom `instanceof` for Writable here will also break the
  // Node.js LazyTransform implementation, which has a non-trivial getter for
  // `_writableState` that would lead to infinite recursion.
  // Checking for a Stream.Duplex instance is faster here instead of inside
  // the WritableState constructor, at least with V8 6.5

  var isDuplex = this instanceof Duplex;
  if (!isDuplex && !realHasInstance.call(Writable, this)) return new Writable(options);
  this._writableState = new WritableState(options, this, isDuplex); // legacy.

  this.writable = true;

  if (options) {
    if (typeof options.write === 'function') this._write = options.write;
    if (typeof options.writev === 'function') this._writev = options.writev;
    if (typeof options.destroy === 'function') this._destroy = options.destroy;
    if (typeof options.final === 'function') this._final = options.final;
  }

  Stream.call(this);
} // Otherwise people can pipe Writable streams, which is just wrong.


Writable.prototype.pipe = function () {
  errorOrDestroy(this, new ERR_STREAM_CANNOT_PIPE());
};

function writeAfterEnd(stream, cb) {
  var er = new ERR_STREAM_WRITE_AFTER_END(); // TODO: defer error events consistently everywhere, not just the cb

  errorOrDestroy(stream, er);
  process.nextTick(cb, er);
} // Checks that a user-supplied chunk is valid, especially for the particular
// mode the stream is in. Currently this means that `null` is never accepted
// and undefined/non-string values are only allowed in object mode.


function validChunk(stream, state, chunk, cb) {
  var er;

  if (chunk === null) {
    er = new ERR_STREAM_NULL_VALUES();
  } else if (typeof chunk !== 'string' && !state.objectMode) {
    er = new ERR_INVALID_ARG_TYPE('chunk', ['string', 'Buffer'], chunk);
  }

  if (er) {
    errorOrDestroy(stream, er);
    process.nextTick(cb, er);
    return false;
  }

  return true;
}

Writable.prototype.write = function (chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;

  var isBuf = !state.objectMode && _isUint8Array(chunk);

  if (isBuf && !Buffer.isBuffer(chunk)) {
    chunk = _uint8ArrayToBuffer(chunk);
  }

  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (isBuf) encoding = 'buffer';else if (!encoding) encoding = state.defaultEncoding;
  if (typeof cb !== 'function') cb = nop;
  if (state.ending) writeAfterEnd(this, cb);else if (isBuf || validChunk(this, state, chunk, cb)) {
    state.pendingcb++;
    ret = writeOrBuffer(this, state, isBuf, chunk, encoding, cb);
  }
  return ret;
};

Writable.prototype.cork = function () {
  this._writableState.corked++;
};

Writable.prototype.uncork = function () {
  var state = this._writableState;

  if (state.corked) {
    state.corked--;
    if (!state.writing && !state.corked && !state.bufferProcessing && state.bufferedRequest) clearBuffer(this, state);
  }
};

Writable.prototype.setDefaultEncoding = function setDefaultEncoding(encoding) {
  // node::ParseEncoding() requires lower case.
  if (typeof encoding === 'string') encoding = encoding.toLowerCase();
  if (!(['hex', 'utf8', 'utf-8', 'ascii', 'binary', 'base64', 'ucs2', 'ucs-2', 'utf16le', 'utf-16le', 'raw'].indexOf((encoding + '').toLowerCase()) > -1)) throw new ERR_UNKNOWN_ENCODING(encoding);
  this._writableState.defaultEncoding = encoding;
  return this;
};

Object.defineProperty(Writable.prototype, 'writableBuffer', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState && this._writableState.getBuffer();
  }
});

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode && state.decodeStrings !== false && typeof chunk === 'string') {
    chunk = Buffer.from(chunk, encoding);
  }

  return chunk;
}

Object.defineProperty(Writable.prototype, 'writableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState.highWaterMark;
  }
}); // if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.

function writeOrBuffer(stream, state, isBuf, chunk, encoding, cb) {
  if (!isBuf) {
    var newChunk = decodeChunk(state, chunk, encoding);

    if (chunk !== newChunk) {
      isBuf = true;
      encoding = 'buffer';
      chunk = newChunk;
    }
  }

  var len = state.objectMode ? 1 : chunk.length;
  state.length += len;
  var ret = state.length < state.highWaterMark; // we must ensure that previous needDrain will not be reset to false.

  if (!ret) state.needDrain = true;

  if (state.writing || state.corked) {
    var last = state.lastBufferedRequest;
    state.lastBufferedRequest = {
      chunk: chunk,
      encoding: encoding,
      isBuf: isBuf,
      callback: cb,
      next: null
    };

    if (last) {
      last.next = state.lastBufferedRequest;
    } else {
      state.bufferedRequest = state.lastBufferedRequest;
    }

    state.bufferedRequestCount += 1;
  } else {
    doWrite(stream, state, false, len, chunk, encoding, cb);
  }

  return ret;
}

function doWrite(stream, state, writev, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  if (state.destroyed) state.onwrite(new ERR_STREAM_DESTROYED('write'));else if (writev) stream._writev(chunk, state.onwrite);else stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  --state.pendingcb;

  if (sync) {
    // defer the callback if we are being called synchronously
    // to avoid piling up things on the stack
    process.nextTick(cb, er); // this can emit finish, and it will always happen
    // after error

    process.nextTick(finishMaybe, stream, state);
    stream._writableState.errorEmitted = true;
    errorOrDestroy(stream, er);
  } else {
    // the caller expect this to happen before if
    // it is async
    cb(er);
    stream._writableState.errorEmitted = true;
    errorOrDestroy(stream, er); // this can emit finish, but finish must
    // always follow error

    finishMaybe(stream, state);
  }
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;
  if (typeof cb !== 'function') throw new ERR_MULTIPLE_CALLBACK();
  onwriteStateUpdate(state);
  if (er) onwriteError(stream, state, sync, er, cb);else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(state) || stream.destroyed;

    if (!finished && !state.corked && !state.bufferProcessing && state.bufferedRequest) {
      clearBuffer(stream, state);
    }

    if (sync) {
      process.nextTick(afterWrite, stream, state, finished, cb);
    } else {
      afterWrite(stream, state, finished, cb);
    }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished) onwriteDrain(stream, state);
  state.pendingcb--;
  cb();
  finishMaybe(stream, state);
} // Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.


function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
} // if there's something in the buffer waiting, then process it


function clearBuffer(stream, state) {
  state.bufferProcessing = true;
  var entry = state.bufferedRequest;

  if (stream._writev && entry && entry.next) {
    // Fast case, write everything using _writev()
    var l = state.bufferedRequestCount;
    var buffer = new Array(l);
    var holder = state.corkedRequestsFree;
    holder.entry = entry;
    var count = 0;
    var allBuffers = true;

    while (entry) {
      buffer[count] = entry;
      if (!entry.isBuf) allBuffers = false;
      entry = entry.next;
      count += 1;
    }

    buffer.allBuffers = allBuffers;
    doWrite(stream, state, true, state.length, buffer, '', holder.finish); // doWrite is almost always async, defer these to save a bit of time
    // as the hot path ends with doWrite

    state.pendingcb++;
    state.lastBufferedRequest = null;

    if (holder.next) {
      state.corkedRequestsFree = holder.next;
      holder.next = null;
    } else {
      state.corkedRequestsFree = new CorkedRequest(state);
    }

    state.bufferedRequestCount = 0;
  } else {
    // Slow case, write chunks one-by-one
    while (entry) {
      var chunk = entry.chunk;
      var encoding = entry.encoding;
      var cb = entry.callback;
      var len = state.objectMode ? 1 : chunk.length;
      doWrite(stream, state, false, len, chunk, encoding, cb);
      entry = entry.next;
      state.bufferedRequestCount--; // if we didn't call the onwrite immediately, then
      // it means that we need to wait until it does.
      // also, that means that the chunk and cb are currently
      // being processed, so move the buffer counter past them.

      if (state.writing) {
        break;
      }
    }

    if (entry === null) state.lastBufferedRequest = null;
  }

  state.bufferedRequest = entry;
  state.bufferProcessing = false;
}

Writable.prototype._write = function (chunk, encoding, cb) {
  cb(new ERR_METHOD_NOT_IMPLEMENTED('_write()'));
};

Writable.prototype._writev = null;

Writable.prototype.end = function (chunk, encoding, cb) {
  var state = this._writableState;

  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (chunk !== null && chunk !== undefined) this.write(chunk, encoding); // .end() fully uncorks

  if (state.corked) {
    state.corked = 1;
    this.uncork();
  } // ignore unnecessary end() calls.


  if (!state.ending) endWritable(this, state, cb);
  return this;
};

Object.defineProperty(Writable.prototype, 'writableLength', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState.length;
  }
});

function needFinish(state) {
  return state.ending && state.length === 0 && state.bufferedRequest === null && !state.finished && !state.writing;
}

function callFinal(stream, state) {
  stream._final(function (err) {
    state.pendingcb--;

    if (err) {
      errorOrDestroy(stream, err);
    }

    state.prefinished = true;
    stream.emit('prefinish');
    finishMaybe(stream, state);
  });
}

function prefinish(stream, state) {
  if (!state.prefinished && !state.finalCalled) {
    if (typeof stream._final === 'function' && !state.destroyed) {
      state.pendingcb++;
      state.finalCalled = true;
      process.nextTick(callFinal, stream, state);
    } else {
      state.prefinished = true;
      stream.emit('prefinish');
    }
  }
}

function finishMaybe(stream, state) {
  var need = needFinish(state);

  if (need) {
    prefinish(stream, state);

    if (state.pendingcb === 0) {
      state.finished = true;
      stream.emit('finish');

      if (state.autoDestroy) {
        // In case of duplex streams we need a way to detect
        // if the readable side is ready for autoDestroy as well
        var rState = stream._readableState;

        if (!rState || rState.autoDestroy && rState.endEmitted) {
          stream.destroy();
        }
      }
    }
  }

  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);

  if (cb) {
    if (state.finished) process.nextTick(cb);else stream.once('finish', cb);
  }

  state.ended = true;
  stream.writable = false;
}

function onCorkedFinish(corkReq, state, err) {
  var entry = corkReq.entry;
  corkReq.entry = null;

  while (entry) {
    var cb = entry.callback;
    state.pendingcb--;
    cb(err);
    entry = entry.next;
  } // reuse the free corkReq.


  state.corkedRequestsFree.next = corkReq;
}

Object.defineProperty(Writable.prototype, 'destroyed', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    if (this._writableState === undefined) {
      return false;
    }

    return this._writableState.destroyed;
  },
  set: function set(value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (!this._writableState) {
      return;
    } // backward compatibility, the user is explicitly
    // managing destroyed


    this._writableState.destroyed = value;
  }
});
Writable.prototype.destroy = destroyImpl.destroy;
Writable.prototype._undestroy = destroyImpl.undestroy;

Writable.prototype._destroy = function (err, cb) {
  cb(err);
};
}).call(this)}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../errors":58,"./_stream_duplex":59,"./internal/streams/destroy":66,"./internal/streams/state":70,"./internal/streams/stream":71,"_process":54,"buffer":36,"inherits":57,"util-deprecate":73}],64:[function(require,module,exports){
(function (process){(function (){
'use strict';

var _Object$setPrototypeO;

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var finished = require('./end-of-stream');

var kLastResolve = Symbol('lastResolve');
var kLastReject = Symbol('lastReject');
var kError = Symbol('error');
var kEnded = Symbol('ended');
var kLastPromise = Symbol('lastPromise');
var kHandlePromise = Symbol('handlePromise');
var kStream = Symbol('stream');

function createIterResult(value, done) {
  return {
    value: value,
    done: done
  };
}

function readAndResolve(iter) {
  var resolve = iter[kLastResolve];

  if (resolve !== null) {
    var data = iter[kStream].read(); // we defer if data is null
    // we can be expecting either 'end' or
    // 'error'

    if (data !== null) {
      iter[kLastPromise] = null;
      iter[kLastResolve] = null;
      iter[kLastReject] = null;
      resolve(createIterResult(data, false));
    }
  }
}

function onReadable(iter) {
  // we wait for the next tick, because it might
  // emit an error with process.nextTick
  process.nextTick(readAndResolve, iter);
}

function wrapForNext(lastPromise, iter) {
  return function (resolve, reject) {
    lastPromise.then(function () {
      if (iter[kEnded]) {
        resolve(createIterResult(undefined, true));
        return;
      }

      iter[kHandlePromise](resolve, reject);
    }, reject);
  };
}

var AsyncIteratorPrototype = Object.getPrototypeOf(function () {});
var ReadableStreamAsyncIteratorPrototype = Object.setPrototypeOf((_Object$setPrototypeO = {
  get stream() {
    return this[kStream];
  },

  next: function next() {
    var _this = this;

    // if we have detected an error in the meanwhile
    // reject straight away
    var error = this[kError];

    if (error !== null) {
      return Promise.reject(error);
    }

    if (this[kEnded]) {
      return Promise.resolve(createIterResult(undefined, true));
    }

    if (this[kStream].destroyed) {
      // We need to defer via nextTick because if .destroy(err) is
      // called, the error will be emitted via nextTick, and
      // we cannot guarantee that there is no error lingering around
      // waiting to be emitted.
      return new Promise(function (resolve, reject) {
        process.nextTick(function () {
          if (_this[kError]) {
            reject(_this[kError]);
          } else {
            resolve(createIterResult(undefined, true));
          }
        });
      });
    } // if we have multiple next() calls
    // we will wait for the previous Promise to finish
    // this logic is optimized to support for await loops,
    // where next() is only called once at a time


    var lastPromise = this[kLastPromise];
    var promise;

    if (lastPromise) {
      promise = new Promise(wrapForNext(lastPromise, this));
    } else {
      // fast path needed to support multiple this.push()
      // without triggering the next() queue
      var data = this[kStream].read();

      if (data !== null) {
        return Promise.resolve(createIterResult(data, false));
      }

      promise = new Promise(this[kHandlePromise]);
    }

    this[kLastPromise] = promise;
    return promise;
  }
}, _defineProperty(_Object$setPrototypeO, Symbol.asyncIterator, function () {
  return this;
}), _defineProperty(_Object$setPrototypeO, "return", function _return() {
  var _this2 = this;

  // destroy(err, cb) is a private API
  // we can guarantee we have that here, because we control the
  // Readable class this is attached to
  return new Promise(function (resolve, reject) {
    _this2[kStream].destroy(null, function (err) {
      if (err) {
        reject(err);
        return;
      }

      resolve(createIterResult(undefined, true));
    });
  });
}), _Object$setPrototypeO), AsyncIteratorPrototype);

var createReadableStreamAsyncIterator = function createReadableStreamAsyncIterator(stream) {
  var _Object$create;

  var iterator = Object.create(ReadableStreamAsyncIteratorPrototype, (_Object$create = {}, _defineProperty(_Object$create, kStream, {
    value: stream,
    writable: true
  }), _defineProperty(_Object$create, kLastResolve, {
    value: null,
    writable: true
  }), _defineProperty(_Object$create, kLastReject, {
    value: null,
    writable: true
  }), _defineProperty(_Object$create, kError, {
    value: null,
    writable: true
  }), _defineProperty(_Object$create, kEnded, {
    value: stream._readableState.endEmitted,
    writable: true
  }), _defineProperty(_Object$create, kHandlePromise, {
    value: function value(resolve, reject) {
      var data = iterator[kStream].read();

      if (data) {
        iterator[kLastPromise] = null;
        iterator[kLastResolve] = null;
        iterator[kLastReject] = null;
        resolve(createIterResult(data, false));
      } else {
        iterator[kLastResolve] = resolve;
        iterator[kLastReject] = reject;
      }
    },
    writable: true
  }), _Object$create));
  iterator[kLastPromise] = null;
  finished(stream, function (err) {
    if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      var reject = iterator[kLastReject]; // reject if we are waiting for data in the Promise
      // returned by next() and store the error

      if (reject !== null) {
        iterator[kLastPromise] = null;
        iterator[kLastResolve] = null;
        iterator[kLastReject] = null;
        reject(err);
      }

      iterator[kError] = err;
      return;
    }

    var resolve = iterator[kLastResolve];

    if (resolve !== null) {
      iterator[kLastPromise] = null;
      iterator[kLastResolve] = null;
      iterator[kLastReject] = null;
      resolve(createIterResult(undefined, true));
    }

    iterator[kEnded] = true;
  });
  stream.on('readable', onReadable.bind(null, iterator));
  return iterator;
};

module.exports = createReadableStreamAsyncIterator;
}).call(this)}).call(this,require('_process'))
},{"./end-of-stream":67,"_process":54}],65:[function(require,module,exports){
'use strict';

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var _require = require('buffer'),
    Buffer = _require.Buffer;

var _require2 = require('util'),
    inspect = _require2.inspect;

var custom = inspect && inspect.custom || 'inspect';

function copyBuffer(src, target, offset) {
  Buffer.prototype.copy.call(src, target, offset);
}

module.exports =
/*#__PURE__*/
function () {
  function BufferList() {
    _classCallCheck(this, BufferList);

    this.head = null;
    this.tail = null;
    this.length = 0;
  }

  _createClass(BufferList, [{
    key: "push",
    value: function push(v) {
      var entry = {
        data: v,
        next: null
      };
      if (this.length > 0) this.tail.next = entry;else this.head = entry;
      this.tail = entry;
      ++this.length;
    }
  }, {
    key: "unshift",
    value: function unshift(v) {
      var entry = {
        data: v,
        next: this.head
      };
      if (this.length === 0) this.tail = entry;
      this.head = entry;
      ++this.length;
    }
  }, {
    key: "shift",
    value: function shift() {
      if (this.length === 0) return;
      var ret = this.head.data;
      if (this.length === 1) this.head = this.tail = null;else this.head = this.head.next;
      --this.length;
      return ret;
    }
  }, {
    key: "clear",
    value: function clear() {
      this.head = this.tail = null;
      this.length = 0;
    }
  }, {
    key: "join",
    value: function join(s) {
      if (this.length === 0) return '';
      var p = this.head;
      var ret = '' + p.data;

      while (p = p.next) {
        ret += s + p.data;
      }

      return ret;
    }
  }, {
    key: "concat",
    value: function concat(n) {
      if (this.length === 0) return Buffer.alloc(0);
      var ret = Buffer.allocUnsafe(n >>> 0);
      var p = this.head;
      var i = 0;

      while (p) {
        copyBuffer(p.data, ret, i);
        i += p.data.length;
        p = p.next;
      }

      return ret;
    } // Consumes a specified amount of bytes or characters from the buffered data.

  }, {
    key: "consume",
    value: function consume(n, hasStrings) {
      var ret;

      if (n < this.head.data.length) {
        // `slice` is the same for buffers and strings.
        ret = this.head.data.slice(0, n);
        this.head.data = this.head.data.slice(n);
      } else if (n === this.head.data.length) {
        // First chunk is a perfect match.
        ret = this.shift();
      } else {
        // Result spans more than one buffer.
        ret = hasStrings ? this._getString(n) : this._getBuffer(n);
      }

      return ret;
    }
  }, {
    key: "first",
    value: function first() {
      return this.head.data;
    } // Consumes a specified amount of characters from the buffered data.

  }, {
    key: "_getString",
    value: function _getString(n) {
      var p = this.head;
      var c = 1;
      var ret = p.data;
      n -= ret.length;

      while (p = p.next) {
        var str = p.data;
        var nb = n > str.length ? str.length : n;
        if (nb === str.length) ret += str;else ret += str.slice(0, n);
        n -= nb;

        if (n === 0) {
          if (nb === str.length) {
            ++c;
            if (p.next) this.head = p.next;else this.head = this.tail = null;
          } else {
            this.head = p;
            p.data = str.slice(nb);
          }

          break;
        }

        ++c;
      }

      this.length -= c;
      return ret;
    } // Consumes a specified amount of bytes from the buffered data.

  }, {
    key: "_getBuffer",
    value: function _getBuffer(n) {
      var ret = Buffer.allocUnsafe(n);
      var p = this.head;
      var c = 1;
      p.data.copy(ret);
      n -= p.data.length;

      while (p = p.next) {
        var buf = p.data;
        var nb = n > buf.length ? buf.length : n;
        buf.copy(ret, ret.length - n, 0, nb);
        n -= nb;

        if (n === 0) {
          if (nb === buf.length) {
            ++c;
            if (p.next) this.head = p.next;else this.head = this.tail = null;
          } else {
            this.head = p;
            p.data = buf.slice(nb);
          }

          break;
        }

        ++c;
      }

      this.length -= c;
      return ret;
    } // Make sure the linked list only shows the minimal necessary information.

  }, {
    key: custom,
    value: function value(_, options) {
      return inspect(this, _objectSpread({}, options, {
        // Only inspect one level.
        depth: 0,
        // It should not recurse.
        customInspect: false
      }));
    }
  }]);

  return BufferList;
}();
},{"buffer":36,"util":22}],66:[function(require,module,exports){
(function (process){(function (){
'use strict'; // undocumented cb() API, needed for core, not for public API

function destroy(err, cb) {
  var _this = this;

  var readableDestroyed = this._readableState && this._readableState.destroyed;
  var writableDestroyed = this._writableState && this._writableState.destroyed;

  if (readableDestroyed || writableDestroyed) {
    if (cb) {
      cb(err);
    } else if (err) {
      if (!this._writableState) {
        process.nextTick(emitErrorNT, this, err);
      } else if (!this._writableState.errorEmitted) {
        this._writableState.errorEmitted = true;
        process.nextTick(emitErrorNT, this, err);
      }
    }

    return this;
  } // we set destroyed to true before firing error callbacks in order
  // to make it re-entrance safe in case destroy() is called within callbacks


  if (this._readableState) {
    this._readableState.destroyed = true;
  } // if this is a duplex stream mark the writable part as destroyed as well


  if (this._writableState) {
    this._writableState.destroyed = true;
  }

  this._destroy(err || null, function (err) {
    if (!cb && err) {
      if (!_this._writableState) {
        process.nextTick(emitErrorAndCloseNT, _this, err);
      } else if (!_this._writableState.errorEmitted) {
        _this._writableState.errorEmitted = true;
        process.nextTick(emitErrorAndCloseNT, _this, err);
      } else {
        process.nextTick(emitCloseNT, _this);
      }
    } else if (cb) {
      process.nextTick(emitCloseNT, _this);
      cb(err);
    } else {
      process.nextTick(emitCloseNT, _this);
    }
  });

  return this;
}

function emitErrorAndCloseNT(self, err) {
  emitErrorNT(self, err);
  emitCloseNT(self);
}

function emitCloseNT(self) {
  if (self._writableState && !self._writableState.emitClose) return;
  if (self._readableState && !self._readableState.emitClose) return;
  self.emit('close');
}

function undestroy() {
  if (this._readableState) {
    this._readableState.destroyed = false;
    this._readableState.reading = false;
    this._readableState.ended = false;
    this._readableState.endEmitted = false;
  }

  if (this._writableState) {
    this._writableState.destroyed = false;
    this._writableState.ended = false;
    this._writableState.ending = false;
    this._writableState.finalCalled = false;
    this._writableState.prefinished = false;
    this._writableState.finished = false;
    this._writableState.errorEmitted = false;
  }
}

function emitErrorNT(self, err) {
  self.emit('error', err);
}

function errorOrDestroy(stream, err) {
  // We have tests that rely on errors being emitted
  // in the same tick, so changing this is semver major.
  // For now when you opt-in to autoDestroy we allow
  // the error to be emitted nextTick. In a future
  // semver major update we should change the default to this.
  var rState = stream._readableState;
  var wState = stream._writableState;
  if (rState && rState.autoDestroy || wState && wState.autoDestroy) stream.destroy(err);else stream.emit('error', err);
}

module.exports = {
  destroy: destroy,
  undestroy: undestroy,
  errorOrDestroy: errorOrDestroy
};
}).call(this)}).call(this,require('_process'))
},{"_process":54}],67:[function(require,module,exports){
// Ported from https://github.com/mafintosh/end-of-stream with
// permission from the author, Mathias Buus (@mafintosh).
'use strict';

var ERR_STREAM_PREMATURE_CLOSE = require('../../../errors').codes.ERR_STREAM_PREMATURE_CLOSE;

function once(callback) {
  var called = false;
  return function () {
    if (called) return;
    called = true;

    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    callback.apply(this, args);
  };
}

function noop() {}

function isRequest(stream) {
  return stream.setHeader && typeof stream.abort === 'function';
}

function eos(stream, opts, callback) {
  if (typeof opts === 'function') return eos(stream, null, opts);
  if (!opts) opts = {};
  callback = once(callback || noop);
  var readable = opts.readable || opts.readable !== false && stream.readable;
  var writable = opts.writable || opts.writable !== false && stream.writable;

  var onlegacyfinish = function onlegacyfinish() {
    if (!stream.writable) onfinish();
  };

  var writableEnded = stream._writableState && stream._writableState.finished;

  var onfinish = function onfinish() {
    writable = false;
    writableEnded = true;
    if (!readable) callback.call(stream);
  };

  var readableEnded = stream._readableState && stream._readableState.endEmitted;

  var onend = function onend() {
    readable = false;
    readableEnded = true;
    if (!writable) callback.call(stream);
  };

  var onerror = function onerror(err) {
    callback.call(stream, err);
  };

  var onclose = function onclose() {
    var err;

    if (readable && !readableEnded) {
      if (!stream._readableState || !stream._readableState.ended) err = new ERR_STREAM_PREMATURE_CLOSE();
      return callback.call(stream, err);
    }

    if (writable && !writableEnded) {
      if (!stream._writableState || !stream._writableState.ended) err = new ERR_STREAM_PREMATURE_CLOSE();
      return callback.call(stream, err);
    }
  };

  var onrequest = function onrequest() {
    stream.req.on('finish', onfinish);
  };

  if (isRequest(stream)) {
    stream.on('complete', onfinish);
    stream.on('abort', onclose);
    if (stream.req) onrequest();else stream.on('request', onrequest);
  } else if (writable && !stream._writableState) {
    // legacy streams
    stream.on('end', onlegacyfinish);
    stream.on('close', onlegacyfinish);
  }

  stream.on('end', onend);
  stream.on('finish', onfinish);
  if (opts.error !== false) stream.on('error', onerror);
  stream.on('close', onclose);
  return function () {
    stream.removeListener('complete', onfinish);
    stream.removeListener('abort', onclose);
    stream.removeListener('request', onrequest);
    if (stream.req) stream.req.removeListener('finish', onfinish);
    stream.removeListener('end', onlegacyfinish);
    stream.removeListener('close', onlegacyfinish);
    stream.removeListener('finish', onfinish);
    stream.removeListener('end', onend);
    stream.removeListener('error', onerror);
    stream.removeListener('close', onclose);
  };
}

module.exports = eos;
},{"../../../errors":58}],68:[function(require,module,exports){
module.exports = function () {
  throw new Error('Readable.from is not available in the browser')
};

},{}],69:[function(require,module,exports){
// Ported from https://github.com/mafintosh/pump with
// permission from the author, Mathias Buus (@mafintosh).
'use strict';

var eos;

function once(callback) {
  var called = false;
  return function () {
    if (called) return;
    called = true;
    callback.apply(void 0, arguments);
  };
}

var _require$codes = require('../../../errors').codes,
    ERR_MISSING_ARGS = _require$codes.ERR_MISSING_ARGS,
    ERR_STREAM_DESTROYED = _require$codes.ERR_STREAM_DESTROYED;

function noop(err) {
  // Rethrow the error if it exists to avoid swallowing it
  if (err) throw err;
}

function isRequest(stream) {
  return stream.setHeader && typeof stream.abort === 'function';
}

function destroyer(stream, reading, writing, callback) {
  callback = once(callback);
  var closed = false;
  stream.on('close', function () {
    closed = true;
  });
  if (eos === undefined) eos = require('./end-of-stream');
  eos(stream, {
    readable: reading,
    writable: writing
  }, function (err) {
    if (err) return callback(err);
    closed = true;
    callback();
  });
  var destroyed = false;
  return function (err) {
    if (closed) return;
    if (destroyed) return;
    destroyed = true; // request.destroy just do .end - .abort is what we want

    if (isRequest(stream)) return stream.abort();
    if (typeof stream.destroy === 'function') return stream.destroy();
    callback(err || new ERR_STREAM_DESTROYED('pipe'));
  };
}

function call(fn) {
  fn();
}

function pipe(from, to) {
  return from.pipe(to);
}

function popCallback(streams) {
  if (!streams.length) return noop;
  if (typeof streams[streams.length - 1] !== 'function') return noop;
  return streams.pop();
}

function pipeline() {
  for (var _len = arguments.length, streams = new Array(_len), _key = 0; _key < _len; _key++) {
    streams[_key] = arguments[_key];
  }

  var callback = popCallback(streams);
  if (Array.isArray(streams[0])) streams = streams[0];

  if (streams.length < 2) {
    throw new ERR_MISSING_ARGS('streams');
  }

  var error;
  var destroys = streams.map(function (stream, i) {
    var reading = i < streams.length - 1;
    var writing = i > 0;
    return destroyer(stream, reading, writing, function (err) {
      if (!error) error = err;
      if (err) destroys.forEach(call);
      if (reading) return;
      destroys.forEach(call);
      callback(error);
    });
  });
  return streams.reduce(pipe);
}

module.exports = pipeline;
},{"../../../errors":58,"./end-of-stream":67}],70:[function(require,module,exports){
'use strict';

var ERR_INVALID_OPT_VALUE = require('../../../errors').codes.ERR_INVALID_OPT_VALUE;

function highWaterMarkFrom(options, isDuplex, duplexKey) {
  return options.highWaterMark != null ? options.highWaterMark : isDuplex ? options[duplexKey] : null;
}

function getHighWaterMark(state, options, duplexKey, isDuplex) {
  var hwm = highWaterMarkFrom(options, isDuplex, duplexKey);

  if (hwm != null) {
    if (!(isFinite(hwm) && Math.floor(hwm) === hwm) || hwm < 0) {
      var name = isDuplex ? duplexKey : 'highWaterMark';
      throw new ERR_INVALID_OPT_VALUE(name, hwm);
    }

    return Math.floor(hwm);
  } // Default value


  return state.objectMode ? 16 : 16 * 1024;
}

module.exports = {
  getHighWaterMark: getHighWaterMark
};
},{"../../../errors":58}],71:[function(require,module,exports){
module.exports = require('events').EventEmitter;

},{"events":40}],72:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

/*<replacement>*/

var Buffer = require('safe-buffer').Buffer;
/*</replacement>*/

var isEncoding = Buffer.isEncoding || function (encoding) {
  encoding = '' + encoding;
  switch (encoding && encoding.toLowerCase()) {
    case 'hex':case 'utf8':case 'utf-8':case 'ascii':case 'binary':case 'base64':case 'ucs2':case 'ucs-2':case 'utf16le':case 'utf-16le':case 'raw':
      return true;
    default:
      return false;
  }
};

function _normalizeEncoding(enc) {
  if (!enc) return 'utf8';
  var retried;
  while (true) {
    switch (enc) {
      case 'utf8':
      case 'utf-8':
        return 'utf8';
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return 'utf16le';
      case 'latin1':
      case 'binary':
        return 'latin1';
      case 'base64':
      case 'ascii':
      case 'hex':
        return enc;
      default:
        if (retried) return; // undefined
        enc = ('' + enc).toLowerCase();
        retried = true;
    }
  }
};

// Do not cache `Buffer.isEncoding` when checking encoding names as some
// modules monkey-patch it to support additional encodings
function normalizeEncoding(enc) {
  var nenc = _normalizeEncoding(enc);
  if (typeof nenc !== 'string' && (Buffer.isEncoding === isEncoding || !isEncoding(enc))) throw new Error('Unknown encoding: ' + enc);
  return nenc || enc;
}

// StringDecoder provides an interface for efficiently splitting a series of
// buffers into a series of JS strings without breaking apart multi-byte
// characters.
exports.StringDecoder = StringDecoder;
function StringDecoder(encoding) {
  this.encoding = normalizeEncoding(encoding);
  var nb;
  switch (this.encoding) {
    case 'utf16le':
      this.text = utf16Text;
      this.end = utf16End;
      nb = 4;
      break;
    case 'utf8':
      this.fillLast = utf8FillLast;
      nb = 4;
      break;
    case 'base64':
      this.text = base64Text;
      this.end = base64End;
      nb = 3;
      break;
    default:
      this.write = simpleWrite;
      this.end = simpleEnd;
      return;
  }
  this.lastNeed = 0;
  this.lastTotal = 0;
  this.lastChar = Buffer.allocUnsafe(nb);
}

StringDecoder.prototype.write = function (buf) {
  if (buf.length === 0) return '';
  var r;
  var i;
  if (this.lastNeed) {
    r = this.fillLast(buf);
    if (r === undefined) return '';
    i = this.lastNeed;
    this.lastNeed = 0;
  } else {
    i = 0;
  }
  if (i < buf.length) return r ? r + this.text(buf, i) : this.text(buf, i);
  return r || '';
};

StringDecoder.prototype.end = utf8End;

// Returns only complete characters in a Buffer
StringDecoder.prototype.text = utf8Text;

// Attempts to complete a partial non-UTF-8 character using bytes from a Buffer
StringDecoder.prototype.fillLast = function (buf) {
  if (this.lastNeed <= buf.length) {
    buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, this.lastNeed);
    return this.lastChar.toString(this.encoding, 0, this.lastTotal);
  }
  buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, buf.length);
  this.lastNeed -= buf.length;
};

// Checks the type of a UTF-8 byte, whether it's ASCII, a leading byte, or a
// continuation byte. If an invalid byte is detected, -2 is returned.
function utf8CheckByte(byte) {
  if (byte <= 0x7F) return 0;else if (byte >> 5 === 0x06) return 2;else if (byte >> 4 === 0x0E) return 3;else if (byte >> 3 === 0x1E) return 4;
  return byte >> 6 === 0x02 ? -1 : -2;
}

// Checks at most 3 bytes at the end of a Buffer in order to detect an
// incomplete multi-byte UTF-8 character. The total number of bytes (2, 3, or 4)
// needed to complete the UTF-8 character (if applicable) are returned.
function utf8CheckIncomplete(self, buf, i) {
  var j = buf.length - 1;
  if (j < i) return 0;
  var nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) self.lastNeed = nb - 1;
    return nb;
  }
  if (--j < i || nb === -2) return 0;
  nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) self.lastNeed = nb - 2;
    return nb;
  }
  if (--j < i || nb === -2) return 0;
  nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) {
      if (nb === 2) nb = 0;else self.lastNeed = nb - 3;
    }
    return nb;
  }
  return 0;
}

// Validates as many continuation bytes for a multi-byte UTF-8 character as
// needed or are available. If we see a non-continuation byte where we expect
// one, we "replace" the validated continuation bytes we've seen so far with
// a single UTF-8 replacement character ('\ufffd'), to match v8's UTF-8 decoding
// behavior. The continuation byte check is included three times in the case
// where all of the continuation bytes for a character exist in the same buffer.
// It is also done this way as a slight performance increase instead of using a
// loop.
function utf8CheckExtraBytes(self, buf, p) {
  if ((buf[0] & 0xC0) !== 0x80) {
    self.lastNeed = 0;
    return '\ufffd';
  }
  if (self.lastNeed > 1 && buf.length > 1) {
    if ((buf[1] & 0xC0) !== 0x80) {
      self.lastNeed = 1;
      return '\ufffd';
    }
    if (self.lastNeed > 2 && buf.length > 2) {
      if ((buf[2] & 0xC0) !== 0x80) {
        self.lastNeed = 2;
        return '\ufffd';
      }
    }
  }
}

// Attempts to complete a multi-byte UTF-8 character using bytes from a Buffer.
function utf8FillLast(buf) {
  var p = this.lastTotal - this.lastNeed;
  var r = utf8CheckExtraBytes(this, buf, p);
  if (r !== undefined) return r;
  if (this.lastNeed <= buf.length) {
    buf.copy(this.lastChar, p, 0, this.lastNeed);
    return this.lastChar.toString(this.encoding, 0, this.lastTotal);
  }
  buf.copy(this.lastChar, p, 0, buf.length);
  this.lastNeed -= buf.length;
}

// Returns all complete UTF-8 characters in a Buffer. If the Buffer ended on a
// partial character, the character's bytes are buffered until the required
// number of bytes are available.
function utf8Text(buf, i) {
  var total = utf8CheckIncomplete(this, buf, i);
  if (!this.lastNeed) return buf.toString('utf8', i);
  this.lastTotal = total;
  var end = buf.length - (total - this.lastNeed);
  buf.copy(this.lastChar, 0, end);
  return buf.toString('utf8', i, end);
}

// For UTF-8, a replacement character is added when ending on a partial
// character.
function utf8End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) return r + '\ufffd';
  return r;
}

// UTF-16LE typically needs two bytes per character, but even if we have an even
// number of bytes available, we need to check if we end on a leading/high
// surrogate. In that case, we need to wait for the next two bytes in order to
// decode the last character properly.
function utf16Text(buf, i) {
  if ((buf.length - i) % 2 === 0) {
    var r = buf.toString('utf16le', i);
    if (r) {
      var c = r.charCodeAt(r.length - 1);
      if (c >= 0xD800 && c <= 0xDBFF) {
        this.lastNeed = 2;
        this.lastTotal = 4;
        this.lastChar[0] = buf[buf.length - 2];
        this.lastChar[1] = buf[buf.length - 1];
        return r.slice(0, -1);
      }
    }
    return r;
  }
  this.lastNeed = 1;
  this.lastTotal = 2;
  this.lastChar[0] = buf[buf.length - 1];
  return buf.toString('utf16le', i, buf.length - 1);
}

// For UTF-16LE we do not explicitly append special replacement characters if we
// end on a partial character, we simply let v8 handle that.
function utf16End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) {
    var end = this.lastTotal - this.lastNeed;
    return r + this.lastChar.toString('utf16le', 0, end);
  }
  return r;
}

function base64Text(buf, i) {
  var n = (buf.length - i) % 3;
  if (n === 0) return buf.toString('base64', i);
  this.lastNeed = 3 - n;
  this.lastTotal = 3;
  if (n === 1) {
    this.lastChar[0] = buf[buf.length - 1];
  } else {
    this.lastChar[0] = buf[buf.length - 2];
    this.lastChar[1] = buf[buf.length - 1];
  }
  return buf.toString('base64', i, buf.length - n);
}

function base64End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) return r + this.lastChar.toString('base64', 0, 3 - this.lastNeed);
  return r;
}

// Pass bytes on through for single-byte encodings (e.g. ascii, latin1, hex)
function simpleWrite(buf) {
  return buf.toString(this.encoding);
}

function simpleEnd(buf) {
  return buf && buf.length ? this.write(buf) : '';
}
},{"safe-buffer":55}],73:[function(require,module,exports){
(function (global){(function (){

/**
 * Module exports.
 */

module.exports = deprecate;

/**
 * Mark that a method should not be used.
 * Returns a modified function which warns once by default.
 *
 * If `localStorage.noDeprecation = true` is set, then it is a no-op.
 *
 * If `localStorage.throwDeprecation = true` is set, then deprecated functions
 * will throw an Error when invoked.
 *
 * If `localStorage.traceDeprecation = true` is set, then deprecated functions
 * will invoke `console.trace()` instead of `console.error()`.
 *
 * @param {Function} fn - the function to deprecate
 * @param {String} msg - the string to print to the console when `fn` is invoked
 * @returns {Function} a new "deprecated" version of `fn`
 * @api public
 */

function deprecate (fn, msg) {
  if (config('noDeprecation')) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (config('throwDeprecation')) {
        throw new Error(msg);
      } else if (config('traceDeprecation')) {
        console.trace(msg);
      } else {
        console.warn(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
}

/**
 * Checks `localStorage` for boolean values for the given `name`.
 *
 * @param {String} name
 * @returns {Boolean}
 * @api private
 */

function config (name) {
  // accessing global.localStorage can trigger a DOMException in sandboxed iframes
  try {
    if (!global.localStorage) return false;
  } catch (_) {
    return false;
  }
  var val = global.localStorage[name];
  if (null == val) return false;
  return String(val).toLowerCase() === 'true';
}

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],74:[function(require,module,exports){
arguments[4][18][0].apply(exports,arguments)
},{"dup":18}],75:[function(require,module,exports){
// Currently in sync with Node.js lib/internal/util/types.js
// https://github.com/nodejs/node/commit/112cc7c27551254aa2b17098fb774867f05ed0d9

'use strict';

var isArgumentsObject = require('is-arguments');
var isGeneratorFunction = require('is-generator-function');
var whichTypedArray = require('which-typed-array');
var isTypedArray = require('is-typed-array');

function uncurryThis(f) {
  return f.call.bind(f);
}

var BigIntSupported = typeof BigInt !== 'undefined';
var SymbolSupported = typeof Symbol !== 'undefined';

var ObjectToString = uncurryThis(Object.prototype.toString);

var numberValue = uncurryThis(Number.prototype.valueOf);
var stringValue = uncurryThis(String.prototype.valueOf);
var booleanValue = uncurryThis(Boolean.prototype.valueOf);

if (BigIntSupported) {
  var bigIntValue = uncurryThis(BigInt.prototype.valueOf);
}

if (SymbolSupported) {
  var symbolValue = uncurryThis(Symbol.prototype.valueOf);
}

function checkBoxedPrimitive(value, prototypeValueOf) {
  if (typeof value !== 'object') {
    return false;
  }
  try {
    prototypeValueOf(value);
    return true;
  } catch(e) {
    return false;
  }
}

exports.isArgumentsObject = isArgumentsObject;
exports.isGeneratorFunction = isGeneratorFunction;
exports.isTypedArray = isTypedArray;

// Taken from here and modified for better browser support
// https://github.com/sindresorhus/p-is-promise/blob/cda35a513bda03f977ad5cde3a079d237e82d7ef/index.js
function isPromise(input) {
	return (
		(
			typeof Promise !== 'undefined' &&
			input instanceof Promise
		) ||
		(
			input !== null &&
			typeof input === 'object' &&
			typeof input.then === 'function' &&
			typeof input.catch === 'function'
		)
	);
}
exports.isPromise = isPromise;

function isArrayBufferView(value) {
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView) {
    return ArrayBuffer.isView(value);
  }

  return (
    isTypedArray(value) ||
    isDataView(value)
  );
}
exports.isArrayBufferView = isArrayBufferView;


function isUint8Array(value) {
  return whichTypedArray(value) === 'Uint8Array';
}
exports.isUint8Array = isUint8Array;

function isUint8ClampedArray(value) {
  return whichTypedArray(value) === 'Uint8ClampedArray';
}
exports.isUint8ClampedArray = isUint8ClampedArray;

function isUint16Array(value) {
  return whichTypedArray(value) === 'Uint16Array';
}
exports.isUint16Array = isUint16Array;

function isUint32Array(value) {
  return whichTypedArray(value) === 'Uint32Array';
}
exports.isUint32Array = isUint32Array;

function isInt8Array(value) {
  return whichTypedArray(value) === 'Int8Array';
}
exports.isInt8Array = isInt8Array;

function isInt16Array(value) {
  return whichTypedArray(value) === 'Int16Array';
}
exports.isInt16Array = isInt16Array;

function isInt32Array(value) {
  return whichTypedArray(value) === 'Int32Array';
}
exports.isInt32Array = isInt32Array;

function isFloat32Array(value) {
  return whichTypedArray(value) === 'Float32Array';
}
exports.isFloat32Array = isFloat32Array;

function isFloat64Array(value) {
  return whichTypedArray(value) === 'Float64Array';
}
exports.isFloat64Array = isFloat64Array;

function isBigInt64Array(value) {
  return whichTypedArray(value) === 'BigInt64Array';
}
exports.isBigInt64Array = isBigInt64Array;

function isBigUint64Array(value) {
  return whichTypedArray(value) === 'BigUint64Array';
}
exports.isBigUint64Array = isBigUint64Array;

function isMapToString(value) {
  return ObjectToString(value) === '[object Map]';
}
isMapToString.working = (
  typeof Map !== 'undefined' &&
  isMapToString(new Map())
);

function isMap(value) {
  if (typeof Map === 'undefined') {
    return false;
  }

  return isMapToString.working
    ? isMapToString(value)
    : value instanceof Map;
}
exports.isMap = isMap;

function isSetToString(value) {
  return ObjectToString(value) === '[object Set]';
}
isSetToString.working = (
  typeof Set !== 'undefined' &&
  isSetToString(new Set())
);
function isSet(value) {
  if (typeof Set === 'undefined') {
    return false;
  }

  return isSetToString.working
    ? isSetToString(value)
    : value instanceof Set;
}
exports.isSet = isSet;

function isWeakMapToString(value) {
  return ObjectToString(value) === '[object WeakMap]';
}
isWeakMapToString.working = (
  typeof WeakMap !== 'undefined' &&
  isWeakMapToString(new WeakMap())
);
function isWeakMap(value) {
  if (typeof WeakMap === 'undefined') {
    return false;
  }

  return isWeakMapToString.working
    ? isWeakMapToString(value)
    : value instanceof WeakMap;
}
exports.isWeakMap = isWeakMap;

function isWeakSetToString(value) {
  return ObjectToString(value) === '[object WeakSet]';
}
isWeakSetToString.working = (
  typeof WeakSet !== 'undefined' &&
  isWeakSetToString(new WeakSet())
);
function isWeakSet(value) {
  return isWeakSetToString(value);
}
exports.isWeakSet = isWeakSet;

function isArrayBufferToString(value) {
  return ObjectToString(value) === '[object ArrayBuffer]';
}
isArrayBufferToString.working = (
  typeof ArrayBuffer !== 'undefined' &&
  isArrayBufferToString(new ArrayBuffer())
);
function isArrayBuffer(value) {
  if (typeof ArrayBuffer === 'undefined') {
    return false;
  }

  return isArrayBufferToString.working
    ? isArrayBufferToString(value)
    : value instanceof ArrayBuffer;
}
exports.isArrayBuffer = isArrayBuffer;

function isDataViewToString(value) {
  return ObjectToString(value) === '[object DataView]';
}
isDataViewToString.working = (
  typeof ArrayBuffer !== 'undefined' &&
  typeof DataView !== 'undefined' &&
  isDataViewToString(new DataView(new ArrayBuffer(1), 0, 1))
);
function isDataView(value) {
  if (typeof DataView === 'undefined') {
    return false;
  }

  return isDataViewToString.working
    ? isDataViewToString(value)
    : value instanceof DataView;
}
exports.isDataView = isDataView;

function isSharedArrayBufferToString(value) {
  return ObjectToString(value) === '[object SharedArrayBuffer]';
}
isSharedArrayBufferToString.working = (
  typeof SharedArrayBuffer !== 'undefined' &&
  isSharedArrayBufferToString(new SharedArrayBuffer())
);
function isSharedArrayBuffer(value) {
  if (typeof SharedArrayBuffer === 'undefined') {
    return false;
  }

  return isSharedArrayBufferToString.working
    ? isSharedArrayBufferToString(value)
    : value instanceof SharedArrayBuffer;
}
exports.isSharedArrayBuffer = isSharedArrayBuffer;

function isAsyncFunction(value) {
  return ObjectToString(value) === '[object AsyncFunction]';
}
exports.isAsyncFunction = isAsyncFunction;

function isMapIterator(value) {
  return ObjectToString(value) === '[object Map Iterator]';
}
exports.isMapIterator = isMapIterator;

function isSetIterator(value) {
  return ObjectToString(value) === '[object Set Iterator]';
}
exports.isSetIterator = isSetIterator;

function isGeneratorObject(value) {
  return ObjectToString(value) === '[object Generator]';
}
exports.isGeneratorObject = isGeneratorObject;

function isWebAssemblyCompiledModule(value) {
  return ObjectToString(value) === '[object WebAssembly.Module]';
}
exports.isWebAssemblyCompiledModule = isWebAssemblyCompiledModule;

function isNumberObject(value) {
  return checkBoxedPrimitive(value, numberValue);
}
exports.isNumberObject = isNumberObject;

function isStringObject(value) {
  return checkBoxedPrimitive(value, stringValue);
}
exports.isStringObject = isStringObject;

function isBooleanObject(value) {
  return checkBoxedPrimitive(value, booleanValue);
}
exports.isBooleanObject = isBooleanObject;

function isBigIntObject(value) {
  return BigIntSupported && checkBoxedPrimitive(value, bigIntValue);
}
exports.isBigIntObject = isBigIntObject;

function isSymbolObject(value) {
  return SymbolSupported && checkBoxedPrimitive(value, symbolValue);
}
exports.isSymbolObject = isSymbolObject;

function isBoxedPrimitive(value) {
  return (
    isNumberObject(value) ||
    isStringObject(value) ||
    isBooleanObject(value) ||
    isBigIntObject(value) ||
    isSymbolObject(value)
  );
}
exports.isBoxedPrimitive = isBoxedPrimitive;

function isAnyArrayBuffer(value) {
  return typeof Uint8Array !== 'undefined' && (
    isArrayBuffer(value) ||
    isSharedArrayBuffer(value)
  );
}
exports.isAnyArrayBuffer = isAnyArrayBuffer;

['isProxy', 'isExternal', 'isModuleNamespaceObject'].forEach(function(method) {
  Object.defineProperty(exports, method, {
    enumerable: false,
    value: function() {
      throw new Error(method + ' is not supported in userland');
    }
  });
});

},{"is-arguments":50,"is-generator-function":51,"is-typed-array":52,"which-typed-array":77}],76:[function(require,module,exports){
(function (process){(function (){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var getOwnPropertyDescriptors = Object.getOwnPropertyDescriptors ||
  function getOwnPropertyDescriptors(obj) {
    var keys = Object.keys(obj);
    var descriptors = {};
    for (var i = 0; i < keys.length; i++) {
      descriptors[keys[i]] = Object.getOwnPropertyDescriptor(obj, keys[i]);
    }
    return descriptors;
  };

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  if (typeof process !== 'undefined' && process.noDeprecation === true) {
    return fn;
  }

  // Allow for deprecating things in the process of starting up.
  if (typeof process === 'undefined') {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnvRegex = /^$/;

if (process.env.NODE_DEBUG) {
  var debugEnv = process.env.NODE_DEBUG;
  debugEnv = debugEnv.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/,/g, '$|^')
    .toUpperCase();
  debugEnvRegex = new RegExp('^' + debugEnv + '$', 'i');
}
exports.debuglog = function(set) {
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (debugEnvRegex.test(set)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
exports.types = require('./support/types');

function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;
exports.types.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;
exports.types.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;
exports.types.isNativeError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

var kCustomPromisifiedSymbol = typeof Symbol !== 'undefined' ? Symbol('util.promisify.custom') : undefined;

exports.promisify = function promisify(original) {
  if (typeof original !== 'function')
    throw new TypeError('The "original" argument must be of type Function');

  if (kCustomPromisifiedSymbol && original[kCustomPromisifiedSymbol]) {
    var fn = original[kCustomPromisifiedSymbol];
    if (typeof fn !== 'function') {
      throw new TypeError('The "util.promisify.custom" argument must be of type Function');
    }
    Object.defineProperty(fn, kCustomPromisifiedSymbol, {
      value: fn, enumerable: false, writable: false, configurable: true
    });
    return fn;
  }

  function fn() {
    var promiseResolve, promiseReject;
    var promise = new Promise(function (resolve, reject) {
      promiseResolve = resolve;
      promiseReject = reject;
    });

    var args = [];
    for (var i = 0; i < arguments.length; i++) {
      args.push(arguments[i]);
    }
    args.push(function (err, value) {
      if (err) {
        promiseReject(err);
      } else {
        promiseResolve(value);
      }
    });

    try {
      original.apply(this, args);
    } catch (err) {
      promiseReject(err);
    }

    return promise;
  }

  Object.setPrototypeOf(fn, Object.getPrototypeOf(original));

  if (kCustomPromisifiedSymbol) Object.defineProperty(fn, kCustomPromisifiedSymbol, {
    value: fn, enumerable: false, writable: false, configurable: true
  });
  return Object.defineProperties(
    fn,
    getOwnPropertyDescriptors(original)
  );
}

exports.promisify.custom = kCustomPromisifiedSymbol

function callbackifyOnRejected(reason, cb) {
  // `!reason` guard inspired by bluebird (Ref: https://goo.gl/t5IS6M).
  // Because `null` is a special error value in callbacks which means "no error
  // occurred", we error-wrap so the callback consumer can distinguish between
  // "the promise rejected with null" or "the promise fulfilled with undefined".
  if (!reason) {
    var newReason = new Error('Promise was rejected with a falsy value');
    newReason.reason = reason;
    reason = newReason;
  }
  return cb(reason);
}

function callbackify(original) {
  if (typeof original !== 'function') {
    throw new TypeError('The "original" argument must be of type Function');
  }

  // We DO NOT return the promise as it gives the user a false sense that
  // the promise is actually somehow related to the callback's execution
  // and that the callback throwing will reject the promise.
  function callbackified() {
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
      args.push(arguments[i]);
    }

    var maybeCb = args.pop();
    if (typeof maybeCb !== 'function') {
      throw new TypeError('The last argument must be of type Function');
    }
    var self = this;
    var cb = function() {
      return maybeCb.apply(self, arguments);
    };
    // In true node style we process the callback on `nextTick` with all the
    // implications (stack, `uncaughtException`, `async_hooks`)
    original.apply(this, args)
      .then(function(ret) { process.nextTick(cb.bind(null, null, ret)) },
            function(rej) { process.nextTick(callbackifyOnRejected.bind(null, rej, cb)) });
  }

  Object.setPrototypeOf(callbackified, Object.getPrototypeOf(original));
  Object.defineProperties(callbackified,
                          getOwnPropertyDescriptors(original));
  return callbackified;
}
exports.callbackify = callbackify;

}).call(this)}).call(this,require('_process'))
},{"./support/isBuffer":74,"./support/types":75,"_process":54,"inherits":49}],77:[function(require,module,exports){
(function (global){(function (){
'use strict';

var forEach = require('foreach');
var availableTypedArrays = require('available-typed-arrays');
var callBound = require('call-bind/callBound');

var $toString = callBound('Object.prototype.toString');
var hasSymbols = require('has-symbols')();
var hasToStringTag = hasSymbols && typeof Symbol.toStringTag === 'symbol';

var typedArrays = availableTypedArrays();

var $slice = callBound('String.prototype.slice');
var toStrTags = {};
var gOPD = require('es-abstract/helpers/getOwnPropertyDescriptor');
var getPrototypeOf = Object.getPrototypeOf; // require('getprototypeof');
if (hasToStringTag && gOPD && getPrototypeOf) {
	forEach(typedArrays, function (typedArray) {
		if (typeof global[typedArray] === 'function') {
			var arr = new global[typedArray]();
			if (!(Symbol.toStringTag in arr)) {
				throw new EvalError('this engine has support for Symbol.toStringTag, but ' + typedArray + ' does not have the property! Please report this.');
			}
			var proto = getPrototypeOf(arr);
			var descriptor = gOPD(proto, Symbol.toStringTag);
			if (!descriptor) {
				var superProto = getPrototypeOf(proto);
				descriptor = gOPD(superProto, Symbol.toStringTag);
			}
			toStrTags[typedArray] = descriptor.get;
		}
	});
}

var tryTypedArrays = function tryAllTypedArrays(value) {
	var foundName = false;
	forEach(toStrTags, function (getter, typedArray) {
		if (!foundName) {
			try {
				var name = getter.call(value);
				if (name === typedArray) {
					foundName = name;
				}
			} catch (e) {}
		}
	});
	return foundName;
};

var isTypedArray = require('is-typed-array');

module.exports = function whichTypedArray(value) {
	if (!isTypedArray(value)) { return false; }
	if (!hasToStringTag) { return $slice($toString(value), 8, -1); }
	return tryTypedArrays(value);
};

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"available-typed-arrays":20,"call-bind/callBound":37,"es-abstract/helpers/getOwnPropertyDescriptor":39,"foreach":41,"has-symbols":45,"is-typed-array":52}]},{},[9])(9)
});
