const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const IPCIDR = require("ip-cidr");
const redis = require('./redis');
const config = require('./config');
const logger = require('./logger');

class Auth {

  constructor() {
    this.isRedisConnected = false;
    this.redis = redis;
  }

  /**
   * @method _connect
   * @description ensure admin redis client is connected
   */
  async _connect() {
    if( this.isRedisConnected ) return;
    await redis.connect();
    this.isRedisConnected = true;
  }

  /**
   * @method ensureSecret
   * @description ensure a server secret is stored in redis.  Generates new secret
   * if none exists
   * 
   * @returns {Promise}
   */
  async ensureSecret() {
    let secret = await this.getSecret();
    if( !secret ) {
      logger.info('Generate new server secret');
      await this.rotateSecret();
    }
  }

  /**
   * @method getSecret
   * @description get the server secret
   * 
   * @returns {Promise} resolves to string
   */
  async getSecret() {
    await this._connect();
    return redis.client.get(config.redis.keys.serverSecret);
  }

  /**
   * @method generateSecret
   * @description generate a new random server secret
   * 
   * @returns {String}
   */
  generateSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * @method rotateSecret
   * @description rotate the server secret.  if no new secret is provided, 
   * a new secret is generated.
   * 
   * TODO: Leave old secret to verify already minted tokens for exp time. Unless
   * a force flag is provided.  Otherwise all users will be logged out.
   * 
   * @param {String} newSecret Optional
   */
  rotateSecret(newSecret) {
    this._connect();
    if( !newSecret ) newSecret = this.generateSecret();
    return redis.client.set(config.redis.keys.serverSecret, newSecret);
  }

  /**
   * @method mintToken
   * @description mint a new jwt token with given payload
   * 
   * @param {Object} payload 
   * @param {Object} opts
   * @param {String} opts.expiresIn
   * 
   * @return {Promise} resolves to JWT string
   */
  async mintToken(payload, opts={}) {
    let token = await jwt.sign(
      payload, 
      await this.getSecret(), { 
        expiresIn: opts.expiresIn || config.jwt.expiresIn 
      }
    );

    return token;
  }

  /**
   * @method verifyToken
   * @description verify server JWT token.  Returns JWT payload if
   * successful otherwise throws error.
   * 
   * @param {String} token 
   * @param {String|Array} reqIpAddresses
   * 
   * @returns {Promise}
   */
  async verifyToken(token, reqIpAddresses) {
    // safety check that we have done this correctly
    if( !reqIpAddresses ) throw Error('Invalid jwt check, no ips provided');

    token = await jwt.verify(token, await this.getSecret());

    if( token.ips && !this.verifyCidr(token.ips, reqIpAddresses) ) {
      throw new Error('Invalid IP: '+token.ips);
    }

    return token;
  }

  /**
   * @method verifyCidr
   * @description verify req ip addressess in cidr array
   * 
   * @param {String|Array} cidrAddresses 
   * @param {String|Array} reqIpAddresses
   * 
   * @returns {Boolean} 
   */
   verifyCidr(cidrAddresses, reqIpAddresses) {
    if( typeof cidrAddresses === 'string' ) {
      cidrAddresses = cidrAddresses.split(',')
		    .map(ip => ip.trim())
	      .map(ip => {
          if( !ip.match(/\//) ) return ip+'/32';
          return ip;
        });
    }
    if( typeof reqIpAddresses === 'string' ) {
      reqIpAddresses = reqIpAddresses.split(',').map(ip => ip.trim());
    }

    let address, reqIp, cidr;
    for( address of cidrAddresses ) {
      cidr = new IPCIDR(address);
      for( reqIp of reqIpAddresses ) {
        if( cidr.contains(reqIp) ) {
          return true;
        }
      }
    }

    return false;
  }

  getRequestIp(req) {
    if( req.get && req.get('x-forwarded-for') ) {
      return req.get('x-forwarded-for');
    }

    if( req.headers && req.headers['x-forwarded-for'] ) {
      return req.headers['x-forwarded-for'];
    }

    if( req.ip || req.address ) {
      return req.ip || req.address;
    }

    if( req.socket && req.socket.remoteAddress ) {
      return req.socket.remoteAddress;
    }

    throw new Error('Could not find ip in request object');
  }

  /**
   * @method getTokenFromRequest
   * @description given an express request object, return the jwt token string if
   * provided; as a cookie, as a Bearer token in the Authorization header.  Otherwise
   * return null
   * 
   * @param {Object} req express request
   * 
   * @returns {String|null}
   */
  getTokenFromRequest(req) {
    let token = req.cookies[config.jwt.cookieName];
    if( token ) return token;
    
    token = req.get('authorization');
    if( token ) return token.replace(/^Bearer /i, '');

    return null;
  }

  /**
   * @method isAdmin
   * @description helper method for seeing if token contains admin role
   * 
   * @param {Object} decodedToken 
   * 
   * @returns {Boolean}
   */
  isAdmin(decodedToken={}) {
    if( decodedToken.admin ) return true;
    if( (decodedToken.roles || []).includes('admin') ) return true;
    return false;
  }

  /**
   * @method getUserRoleKey
   * @description given a username and role, return the redis acl key
   * 
   * @param {String} username 
   * @param {String} role 
   * 
   * @returns {String}
   */
  getUserRoleKey(username, role) {
    return config.redis.prefixes.roles+username+'-'+role;
  }

  /**
   * @method setUserRole
   * @description given a username and role, set redis acl key
   * 
   * @param {String} username 
   * @param {String} role 
   * 
   * @returns {Promise}
   */
  setUserRole(username, role) {
    this._connect();
    return redis.client.set(this.getUserRoleKey(username, role), true);
  }

  /**
   * @method removeUserRole
   * @description given a username and role, remove redis acl key
   * 
   * @param {String} username 
   * @param {String} role 
   * 
   * @returns {Promise}
   */
  removeUserRole(username, role) {
    this._connect();
    return redis.client.del(this.getUserRoleKey(username, role));
  }

  /**
   * @method handleLogin
   * @description provided a express response and a username, mint a new jwt token
   * for user and set jwt cookie.  This should be called on successful response from
   * the auth service by the gateway service.
   * 
   * @param {Object} res express response
   * @param {String} username 
   * @param {Object} properties additional properties from auth serives
   */
  async handleLogin(res, username, properties={}) {
    this._connect();
    let roles = ((await redis.client.keys(this.getUserRoleKey(username, '*'))) || [])
      .map(role => role.replace(this.getUserRoleKey(username, ''), ''));

    if( properties.roles ) {
      roles = [...roles, ...properties.roles];
    }

    properties.username = username;
    redis.client.set(
      config.redis.prefixes.authProperties+username,
      JSON.stringify(properties)
    );

    res.cookie(
      config.jwt.cookieName, 
      await this.mintToken({username, roles}),
      { 
        maxAge: config.jwt.expiresIn, 
        httpOnly: true,
        sameSite : 'lax'
      }
    );
  }

  /**
   * @method handleLogout
   * @description destroy the user jwt cookie given express response
   * 
   * @param {Object} req 
   * @param {Object} res 
   */
  handleLogout(req, res) {
    res.clearCookie(config.jwt.cookieName,  {
      httpOnly: true,
      sameSite : 'lax'
    });
  }

}

module.exports = new Auth();