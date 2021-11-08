const crypto = require('crypto');
const jwt = require('jsonwebtoken');
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
  _connect() {
    if( this.isRedisConnected ) return;
    this.isRedisConnected = true;
    return redis.connect();
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
   * 
   * @return {Promise} resolves to JWT string
   */
  async mintToken(payload) {
    return jwt.sign(payload, await this.getSecret(), { expiresIn: config.jwt.expiresIn });
  }

  /**
   * @method verifyToken
   * @description verify server JWT token.  Returns JWT payload if
   * successful otherwise throws error.
   * 
   * @param {String} token 
   * 
   * @returns {Promise}
   */
  async verifyToken(token) {
    return jwt.verify(token, await this.getSecret());
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
    
    token = req.get('Authorization');
    if( token ) return token.replace(/^Bearer /, '');

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