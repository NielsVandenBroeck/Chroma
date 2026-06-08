const path = require("path");
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: "development",

    entry: "./src/game.js",

    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'game.bundle.js',
        clean: true,
    },

    plugins: [
        new HtmlWebpackPlugin({
            template: './public/index.html',
        }),
        new CopyWebpackPlugin({
            patterns: [
                { from: './public/style.css', to: 'style.css' }
            ]
        })
    ],
};