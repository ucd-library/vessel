const {sparql} = require('@ucd-lib/rp-node-utils');

class UpdateWindow {

  constructor(handler) {
    this.MAX_WAIT = 30000;
    this.MIN_WAIT = 3000;

    this.data = {};
    this.wait = this.MIN_WAIT;
    this.handler = handler;
    this.timer = null;
  }

  add(subjects) {
    this.emit = false;
    if( this.timer !== null ) {
      clearTimeout(this.timer);
    }

    for( let subject of subjects ) {
      this.data[subject] = true;
    }

    // for( let subject in subjects ) {
    //   this._push(subject, subjects[subject]);
    // }

    if( this.wait < this.MAX_WAIT ) {
      this.wait = this.wait * 1.25;
      if( this.wait > this.MAX_WAIT ) {
        this.wait = this.MAX_WAIT;
      }
    }

    this.timer = setTimeout(() => {
      this.emit = true;
      this.wait = this.MIN_WAIT;

      this._trigger();
    }, this.wait);
    console.log('Update window set for: '+new Date(Date.now()+this.wait).toISOString())
  }

  // _push(subject, types) {
  //   // check that we care about type
  //   let include = false;
  //   for( let type of types ) {
  //     if( sparql.TYPES[type] ) {
  //       include = true;
  //       break;
  //     }
  //   }
  //   if( !include ) return;

  //   if( !this.data[subject] ) {
  //     this.data[subject] = [];
  //   }

  //   for( let type of types ) {
  //     if( !this.data[subject].includes(type) ) {
  //       this.data[subject].push(type);
  //     }
  //   }
  // }


  async _trigger() {
    let subjects = Object.keys(this.data);
    console.log('Starting update, subject count: '+subjects.length);

    for( let subject of subjects ) {
      if( !this.emit ) return;

      // let types = this.data[subject];
      delete this.data[subject];

      await this.handler(subject);
    }
  }

}

module.exports = UpdateWindow;