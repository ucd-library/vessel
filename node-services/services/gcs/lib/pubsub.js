// Imports the Google Cloud client library. v1 is for the lower level
// proto access.
const { v1 } = require("@google-cloud/pubsub");
const {config} = require('@ucd-lib/rp-node-utils');

// create pub/sub notications for bucket
// https://cloud.google.com/storage/docs/reporting-changes#gsutil_1
// gsutil notification create -t TOPIC_NAME -f json gs://BUCKET_NAME
class PubSubWrapper {

  constructor() {
    this.client = new v1.SubscriberClient({
      projectId : config.google.projectId
    });
  }

  /**
   * @method process
   * @description process pub sub messages.  Pulls a given number of pub/sub
   * messages from topic, calls the callback function.  The callback
   * function should return a promise, which is resolved when message
   * processing is complete.  After the callback function completes
   * this method will ack the message and return, resolving the returned
   * function promise.
   * 
   * @param {String} topicName 
   * @param {String} callback 
   */
  async process(topicName, count, callback) {
    if( typeof count === 'function' ) {
      callback = count;
      count = 10;
    }

    const formattedSubscription = this.client.subscriptionPath(
      config.google.projectId,
      topicName
    );

    // The maximum number of messages returned for this request.
    // Pub/Sub may return fewer than the number specified.
    const request = {
      subscription: formattedSubscription,
      maxMessages: count,
    };

    // The subscriber pulls a specified number of messages.
    const [response] = await this.client.pull(request);

    if( response.receivedMessages.length === 0 ) {
      await callback(null, 0, 0);
      return 0;
    }

    // Process the messages.
    let i = 0;
    for (const message of response.receivedMessages) {
      i++;

      let data = Buffer.from(message.message.data, 'base64').toString().trim();
      await callback(JSON.parse(data), i, response.receivedMessages.length);

      let ackRequest = {
        subscription: formattedSubscription,
        ackIds: [message.ackId],
      };
  
      await this.client.acknowledge(ackRequest);
    }

    return response.receivedMessages.length;
  }

}

const pubsub = new PubSubWrapper();
module.exports = pubsub;