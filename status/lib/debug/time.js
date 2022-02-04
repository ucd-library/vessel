

function sleep() {
  return new Promise((resolve, reject) => {
    let t = 5 + Math.round(Math.random() * 5);
    setTimeout(() => resolve(t), t);
  });
}

(async function() {

  for( let i = 0; i < 100000; i++ ) {
    let t1 = Date.now();
    let delay = await sleep();
    let t2 = Date.now();
    if( t2 - t1 < 0 ) console.log(i+'. Negative timestamp!', t2 - t1, delay, 'before: '+t1, 'after: '+t2);
  }
  console.log('done');
})();