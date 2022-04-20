const AWS = require("aws-sdk");

const s3Client = new AWS.S3({
  //Get the endpoint from the DO website for your space
  endpoint: "nyc3.digitaloceanspaces.com",
  useAccelerateEndpoint: false,
  //Create a credential using DO Spaces API key (https://cloud.digitalocean.com/account/api/tokens)
  credentials: new AWS.Credentials(
    "V32I4NMW6PYAEJ6P4WMY",
    "yyllqxa1VpNn8HShEG0GgRk6KCrRAUJ4MYpC5wkK1u8",
    null
  ),
});

const s3 = {};
s3.s3Client = s3Client;

module.exports = s3;
