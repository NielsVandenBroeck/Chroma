/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./src/hub.js"
/*!********************!*\
  !*** ./src/hub.js ***!
  \********************/
() {

eval("{document.getElementById('btn-chroma').addEventListener('click', () => {\n    // Preserve the query params so the SDK on the next page has the frame_id\n    window.location.href = '/chroma.html' + window.location.search;\n});\n\ndocument.getElementById('btn-flagle').addEventListener('click', () => {\n    window.location.href = '/flagle.html' + window.location.search;\n});\n\n//# sourceURL=webpack://chroma/./src/hub.js?\n}");

/***/ }

/******/ 	});
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = {};
/******/ 	__webpack_modules__["./src/hub.js"]();
/******/ 	
/******/ })()
;