let json;

module.exports = (msg, kafka) => {
  
  json = JSON.parse(msg.value.toString('utf-8'));
  if( 
    json.subject === 'http://experts.ucdavis.edu/concept/free/20420a8c31c48dfa209fecf9ad2c0bd1' &&
    json.index === 'research-profiles-1636155138114' ) {
    console.log(kafka.utils.getMsgId(msg));
    console.log(json);
  }
}