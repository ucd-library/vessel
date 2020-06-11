

class UpdateBuffer {

  constructor() {
    this.timers = {};
    this.waitFor = 1000 * 30;
  }

  add(type, uri) {
    if( this.timers[uri] ) {
      clearTimeout(this.timers[uri]);
    }

    this.timers[uri] = {
      
    }
  }

}