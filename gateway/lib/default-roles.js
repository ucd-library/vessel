const {logger, auth} = require('@ucd-lib/rp-node-utils')

/**
 * @function initDefaultRoles
 * @description ensure the default roles are added in the system
 * Should be called on startup
 */
module.exports = async function initDefaultRoles() {
  for (let [role,members] of Object.entries(process.env)) {
    if (role==='DEFAULT_ADMINS') {
      role='DEFAULT_ADMIN_ROLE'
    }
    let found=role.match(/^DEFAULT_([A-Z]+)_ROLE$/)
    if (found[1]) {
      role=found[1].toLowerCase();
      members=members.split(' ').map(member=>member.trim());
      auth._connect();
      for( const member of members ) {
        let result = await auth.redis.client.get(auth.getUserRoleKey(member, role));
        if( !result ) {
          logger.info(`Setting default ${role}: ${member}`);
          auth.setUserRole(member,role);
        }
  }
}
