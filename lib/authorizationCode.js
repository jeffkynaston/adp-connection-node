'use strict';

var log = require('winston');
var readCerts = require('./readCerts');
var fs = require('fs');
var _ = require('underscore');
var config = require('config');
var Post = require('./post');

class AuthorizationCode {

	constructor(app) {
		this.app = app;
	}

	init(opts, cb) {
		if(opts.keepAlive){
			log.warn('Session KeepAlive not allowed for Authorization Code Grant Type.');
		}
		this.authCode = opts.authCode;
		this.cb = cb;
		this.getCerts(opts);
	}

	getCerts() {
		readCerts({app: this.app}, (err, certs) => {
			if(err) {
				return this.cb(err, certs);
			}
			this.certs = certs;
			this.getAccessToken();
		});
	}

	authorizationUrl() {
		var authorizationurl = config.get(this.app).connect.authorizationurl;
		var clientId = config.get(this.app).connect.client.id;
		var clientSecret = config.get(this.app).connect.client.secret;
		var responseType = config.get(this.app).connect.responsetype;
		var callbackUrl = config.get(this.app).connect.callbackurl;
		var scope = config.get(this.app).connect.scope;

		if(!authorizationurl) {
			throw Error('Missing authorization url. Check `config>default.js>connect.authorizationurl` value.');
		}
		if(!clientId || !clientSecret) {
			throw Error('Missing client information. Check `config>default.js>connect.client` configuration.');
		}
		if(!callbackUrl) {
			throw Error('Missing callback url information. Check `config>default.js>connect.callbackurl` value.');
		}
		if(!responseType) {
			throw Error('Missing response type url information. Check `config>default.js>connect.responsetype` value.');
		}
		if(!scope) {
			throw Error('Missing response type url information. Check `config>default.js>connect.scope` value.');
		}

		return encodeURI(
			authorizationurl +
			'?client_id=' + clientId +
			'&response_type=' + responseType +
			'&redirect_uri=' + callbackUrl +
			'&scope=' + scope +
			'&state=' + Math.random());
	}

	setTokenExpiration(token) {
		this.tokenEpiration = (token.expires_in || config.get(this.app).connect.defaultexpiration) * 1000;
	}

	getAccessToken() {
		var options = {
			requestDesc: 'Authorization Code - Access Token Request',
			app: this.app,
			url: config.get(this.app).connect.tokenurl,
			payload: this.buildTokenRequestBody()
		};
		new Post(options, this.parseTokenResponse.bind(this));
	}

	parseTokenResponse(err, token) {
		if(err) {
			log.error('Get access token retuned error.' + err);
		}
		if(!token || !token.access_token) {
			log.error('Unable to retrieve access token.');
		} else {
			this.setTokenExpiration(token);
		}
		this.cb(err, token);
	}

	buildTokenRequestBody() {
		var securityOptions = config.get(this.app).connect.securityoptions;
		var clientId = config.get(this.app).connect.client.id;
		var clientSecret = config.get(this.app).connect.client.secret;
		var granttype = config.get(this.app).connect.granttype;
		var pem = _.where(this.certs, {type: 'pem'})[0];
		var key = _.where(this.certs, {type: 'key'})[0];
		var callbackUrl = config.get(this.app).connect.callbackurl;

		if(!granttype) {
			throw Error('Missing grant type. Check `config>default.js>connect>granttype` value.');
		}
		if(!securityOptions) {
			throw Error('Missing security options. Check `config>default.js>connect.securityoptions` value.');
		}
		if(!clientId || !clientSecret) {
			throw Error('Missing client information. Check `config>default.js>connect.client` configuration.');
		}

		var payload = {
			agentOptions: {
				ca: [fs.readFileSync(pem.path)],
				key: fs.readFileSync(key.path),
				cert: fs.readFileSync(pem.path),
				securityOptions: securityOptions
			},
			strictSSL: false,
			form: {
				grant_type: granttype,
				code: this.authCode,
				redirect_uri: callbackUrl,
				client_id: clientId,
				client_secret: clientSecret
			}
		};
		return payload;
	}
}

module.exports = AuthorizationCode;