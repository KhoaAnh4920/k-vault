const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const s3 = new S3Client({
  region: 'us-east-1',
  endpoint: 'http://100.70.112.71:9000',
  credentials: { accessKeyId: 'admin', secretAccessKey: 'admin_password' },
  forcePathStyle: true,
});
async function main() {
  const cmd = new ListObjectsV2Command({
    Bucket: 'k-vault',
    Prefix: '1YIieo9nY430vlL7vvdN5TbTSZ6y5IoD1/6315d3a3-2e42-4fda-aeab-ad919a548642'
  });
  const res = await s3.send(cmd);
  console.log('Keys:', res.Contents ? res.Contents.map(c => c.Key + ':' + c.Size) : 'none');
}
main();
