const path = require("path");
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: "development",

    // Just one entry point now!
    entry: "./src/hub.js",

    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bundle.js',
        clean: true,
    },

    plugins: [
        // Just one HTML file!
        new HtmlWebpackPlugin({
            template: './public/index.html',
            filename: 'index.html',
        }),

        new CopyWebpackPlugin({
            patterns: [
                { from: './public/style.css', to: 'style.css' }
            ]
        })
    ],
};