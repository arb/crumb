// Load modules

var Lab = require('lab');
var Hapi = require('hapi');
var Crumb = require('../');
var Stream = require('stream');
var Hoek = require('hoek');


// Declare internals

var internals = {};


// Test shortcuts

var expect = Lab.expect;
var before = Lab.before;
var after = Lab.after;
var describe = Lab.experiment;
var it = Lab.test;


describe('Crumb', function () {

    var options = {
        views: {
            path: __dirname + '/templates',
            engines: {
                html: require('handlebars')
            }
        }
    };

    it('returns view with crumb', function (done) {

        var server = new Hapi.Server(options);
        server.route([
            {
                method: 'GET', path: '/1', handler: function (request, reply) {

                    expect(request.plugins.crumb).to.exist;
                    expect(request.server.plugins.crumb.generate).to.exist;

                    return reply.view('index', {
                        title: 'test',
                        message: 'hi'
                    });
                }
            },
            {
                method: 'POST', path: '/2', handler: function (request, reply) {

                    expect(request.payload).to.deep.equal({ key: 'value' });
                    return reply('valid');
                }
            },
            {
                method: 'POST', path: '/3', config: { payload: { output: 'stream' } }, handler: function (request, reply) {

                    return reply('never');
                }
            },
            {
                method: 'GET', path: '/4', config: { plugins: { crumb: false } }, handler: function (request, reply) {

                    return reply.view('index', {
                        title: 'test',
                        message: 'hi'
                    });
                }
            },
            {
                method: 'POST', path: '/5', config: { payload: { output: 'stream' } }, handler: function (request, reply) {

                    return reply('yo');
                }
            },
            {
                method: 'GET', path: '/6', handler: function (request, reply) {

                    return reply.view('index');
                }
            }
        ]);

        server.pack.register({ plugin: require('../'), options: { cookieOptions: { isSecure: true } } }, function (err) {

            expect(err).to.not.exist;
            server.inject({ method: 'GET', url: '/1' }, function (res) {

                var header = res.headers['set-cookie'];
                expect(header.length).to.equal(1);
                expect(header[0]).to.contain('Secure');

                var cookie = header[0].match(/crumb=([^\x00-\x20\"\,\;\\\x7F]*)/);
                expect(res.result).to.equal('<!DOCTYPE html><html><head><title>test</title></head><body><div><h1>hi</h1><h2>' + cookie[1] + '</h2></div></body></html>');

                server.inject({ method: 'POST', url: '/2', payload: '{ "key": "value", "crumb": "' + cookie[1] + '" }', headers: { cookie: 'crumb=' + cookie[1] } }, function (res) {

                    expect(res.result).to.equal('valid');

                    server.inject({ method: 'POST', url: '/2', payload: '{ "key": "value", "crumb": "x' + cookie[1] + '" }', headers: { cookie: 'crumb=' + cookie[1] } }, function (res) {

                        expect(res.statusCode).to.equal(403);

                        server.inject({ method: 'POST', url: '/3', headers: { cookie: 'crumb=' + cookie[1] } }, function (res) {

                            expect(res.statusCode).to.equal(403);

                            server.inject({ method: 'GET', url: '/4' }, function (res) {

                                expect(res.result).to.equal('<!DOCTYPE html><html><head><title>test</title></head><body><div><h1>hi</h1><h2></h2></div></body></html>');

                                var TestStream = function (opt) {

                                      Stream.Readable.call(this, opt);
                                      this._max = 2;
                                      this._index = 1;
                                };

                                Hoek.inherits(TestStream, Stream.Readable);

                                TestStream.prototype._read = function() {

                                    var i = this._index++;
                                    if (i > this._max)
                                        this.push(null);
                                    else {
                                        var str = '' + i;
                                        var buf = new Buffer(str, 'ascii');
                                        this.push(buf);
                                    }
                                };

                                server.inject({ method: 'POST', url: '/5', payload: new TestStream(), headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="test.txt"' }, simulate: { end: true } }, function (res) {

                                    expect(res.statusCode).to.equal(403);

                                    server.inject({method: 'GET', url: '/6'}, function(res) {

                                        var header = res.headers['set-cookie'];
                                        expect(header.length).to.equal(1);
                                        expect(header[0]).to.contain('Secure');

                                        var cookie = header[0].match(/crumb=([^\x00-\x20\"\,\;\\\x7F]*)/);
                                        expect(res.result).to.equal('<!DOCTYPE html><html><head><title></title></head><body><div><h1></h1><h2>' + cookie[1] + '</h2></div></body></html>');

                                        done();
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });

    it('Does not add crumb to view context when "addToViewContext" option set to false', function(done) {

        var server = new Hapi.Server(options);
        server.route({
            method: 'GET', path: '/1', handler: function (request, reply) {

                expect(request.plugins.crumb).to.exist;
                expect(request.server.plugins.crumb.generate).to.exist;

                return reply.view('index', {
                    title: 'test',
                    message: 'hi'
                });
            }
        });

        server.pack.register({ plugin: require('../'), options: { cookieOptions: { isSecure: true }, addToViewContext: false } }, function (err) {

            expect(err).to.not.exist;
            server.inject({ method: 'GET', url: '/1' }, function (res) {

                expect(res.result).to.equal('<!DOCTYPE html><html><head><title>test</title></head><body><div><h1>hi</h1><h2></h2></div></body></html>');
                done();
            });
        });
    });

    it('Works without specifying plugin options', function(done) {

        var server = new Hapi.Server(options);
        server.route({
            method: 'GET', path: '/1', handler: function (request, reply) {

                expect(request.plugins.crumb).to.exist;
                expect(request.server.plugins.crumb.generate).to.exist;

                return reply.view('index', {
                    title: 'test',
                    message: 'hi'
                });
            }
        });

        server.pack.register(require('../'), function (err) {

            expect(err).to.not.exist;

            server.inject({ method: 'GET', url: '/1' }, function (res) {

                var header = res.headers['set-cookie'];
                expect(header.length).to.equal(1);

                var cookie = header[0].match(/crumb=([^\x00-\x20\"\,\;\\\x7F]*)/);
                expect(res.result).to.equal('<!DOCTYPE html><html><head><title>test</title></head><body><div><h1>hi</h1><h2>' + cookie[1] + '</h2></div></body></html>');
                done();

            });
        });
    });

    it('route uses crumb when route.config.plugins.crumb set to true and autoGenerate set to false', function(done) {

        var server = new Hapi.Server(options);
        server.route([
            {
                method: 'GET', path: '/1', handler: function (request, reply) {

                    var crumb = request.plugins.crumb;
                    expect(crumb).to.be.undefined;
                    return reply('bonjour');
                }
            },
            {
                method: 'GET', path: '/2', config: { plugins: { crumb: true } }, handler: function(request, reply) {

                    var crumb = request.plugins.crumb;
                    return reply('hola');
                }
            }
        ]);

        server.pack.register({ plugin: require('../'), options: { autoGenerate: false } }, function (err) {

            expect(err).to.not.exist;

            server.inject({ method: 'GET', url: '/1' }, function (res) {

                server.inject({ method: 'GET', url: '/2'}, function (res) {

                    var header = res.headers['set-cookie'];
                    expect(header.length).to.equal(1);
                    var cookie = header[0].match(/crumb=([^\x00-\x20\"\,\;\\\x7F]*)/);

                    done();
                });
            });
        });
    });
});