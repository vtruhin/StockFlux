const webpack = require('webpack');

const sharedConfig = require('./webpack.config.shared.js');

const config = Object.assign({}, sharedConfig);

config.output.path = `${__dirname}/../public`;
config.plugins.push(
    new webpack.DefinePlugin({
        'process.env.NODE_ENV': '"production"'
    })
);

module.exports = config;
