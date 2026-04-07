const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
const s3 = new S3Client({
  region: 'us-east-1',
  endpoint: 'http://100.70.112.71:9000',
  credentials: { accessKeyId: 'admin', secretAccessKey: 'admin_password' },
  forcePathStyle: true,
});
async function main() {
  try {
    const cmd = new HeadObjectCommand({
      Bucket: 'k-vault',
      Key: '1YIieo9nY430vlL7vvdN5TbTSZ6y5IoD1/d470d164-98ab-441e-b5c9-fab521d8f06b/SD_segment000.ts'
    });
    const res = await s3.send(cmd);
    console.log('Size:', res.ContentLength);
  } catch (e) {
    console.log('ERROR:', e.name, e.message);
  }
}
main();
