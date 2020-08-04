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

  _connect() {
    if( this.isRedisConnected ) return;
    this.isRedisConnected = true;
    return redis.connect();
  }

  async ensureSecret() {
    let secret = await this.getSecret();
    if( !secret ) {
      logger.info('Generate new server secret');
      await this.rotateSecret();
    }
  }

  getSecret() {
    this._connect();
    return redis.client.get(config.redis.keys.serverSecret);
  }

  generateSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  rotateSecret(newSecret) {
    this._connect();
    if( !newSecret ) newSecret = this.generateSecret();
    return redis.client.set(config.redis.keys.serverSecret, newSecret);
  }

  async mintToken(msg) {
    return jwt.sign(msg, await this.getSecret(), { expiresIn: config.jwt.expiresIn });
  }

  async verifyToken(token) {
    return jwt.verify(token, await this.getSecret());
  }

  getTokenFromRequest(req) {
    let token = req.cookies[config.jwt.cookieName];
    if( token ) return token;
    
    token = req.get('Authizoration');
    if( token ) return token.replace(/^Bearer /, '');

    return null;
  }

  isAdmin(decodedToken) {
    if( decodedToken.admin ) return true;
    if( (decodedToken.roles || []).includes('admin') ) return true;
    return false;
  }

  getUserRoleKey(username, role) {
    return config.redis.prefixes.roles+username+'-'+role;
  }

  setUserRole(username, role) {
    this._connect();
    return redis.client.set(this.getUserRoleKey(username, role), true);
  }

  removeUserRole(username, role) {
    this._connect();
    return redis.client.del(this.getUserRoleKey(username, role));
  }

  async handleLogin(res, username) {
    this._connect();
    let roles = ((await redis.client.keys(this.getUserRoleKey(username, '*'))) || [])
      .map(role => role.replace(this.getUserRoleKey(username, ''), ''));

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

  handleLogout(req, res) {
    res.clearCookie(config.jwt.cookieName,  {
      httpOnly: true,
      sameSite : 'lax'
    });
  }

}

module.exports = new Auth();