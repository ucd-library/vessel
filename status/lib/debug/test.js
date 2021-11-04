let json;

module.exports = (msg, kafka) => {
  
  json = JSON.parse(msg.value.toString('utf-8'));
  if( 
    json.subject === 'http://experts.ucdavis.edu/concept/free/479d57d583cc7e26f8c8b244c20729eb' &&
    json.index === 'research-profiles-1635971012755' ) {
    console.log(kafka.utils.getMsgId(msg));
    console.log(json);
  }
}