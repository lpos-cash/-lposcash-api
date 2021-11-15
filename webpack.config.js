'use strict'

const path = require('path')
const webpack = require('webpack')
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin

const CompressionPlugin = require('compression-webpack-plugin')

var nodeExternals = require('webpack-node-externals')

var browser_config = {
  mode: 'production',
  entry: {
    '@lposcash/api': './src/index.js'
  },
  devtool: 'eval-source-map',
  optimization: {
    minimize: true
  },
  output: {
    library: ['lposcash'],
    libraryTarget: 'var',
    path: path.join(__dirname, 'dist'),
    filename: 'lposcash-web.js'
  },
  resolve: {
    fallback: {
      "zlib": require.resolve("zlib-browserify"),
      "http": require.resolve("http-browserify"),
      "https": require.resolve("https-browserify"),
      "constants": require.resolve("constants-browserify")
      
    }
  },
  /*node: {
    fs: 'empty',
    net: 'empty',
    dns: 'empty',
  },*/
  plugins: [
    new CompressionPlugin(),
    new webpack.DefinePlugin({
      'process.env.ENV': JSON.stringify('web')
    })/*,
    new BundleAnalyzerPlugin()*/
  ]
}

module.exports = [
  browser_config, 
  //node_config
]
