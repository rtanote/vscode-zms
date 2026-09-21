// node --require ./test/setup.js で読み込む。
// 'vscode' モジュール解決をローカルモックに向ける (拡張ホスト外で走らせるため)。
"use strict";
const path = require("path");
const Module = require("module");

const MOCK = path.resolve(__dirname, "vscode-mock.js");
const originalResolve = Module._resolveFilename;

Module._resolveFilename = function (request, ...rest) {
  if (request === "vscode") return MOCK;
  return originalResolve.call(this, request, ...rest);
};
