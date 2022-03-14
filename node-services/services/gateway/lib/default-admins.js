const {logger, auth} = require('@ucd-lib/rp-node-utils')

/**
 * @function initDefaultAdmins
 * @description ensure the default admins are in the system
 * Should be called on startup
 */
module.exports = async function initDefaultAdmins() {
  let admins = process.env.DEFAULT_ADMINS;
  if( !admins ) return;
  admins = admins.split(' ').map(admin => admin.trim());

  await auth._connect();
  for( let admin of admins ) {
    let result = await auth.redis.client.get(auth.getUserRoleKey(admin, 'admin'));
    if( !result ) {
      logger.info(`Setting default admin: ${admin}`);
      auth.setUserRole(admin, 'admin');
    }
  }
}
