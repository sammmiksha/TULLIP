import test from 'node:test';
import assert from 'node:assert/strict';
import { release, releaseReady } from './dist/release.mjs';
const candidate = { available:true, version:'0.3.0', sizeBytes:1000000, sha256:'a'.repeat(64), downloadUrl:'https://github.com/sammmiksha/TULLIP/releases/download/v0.3.0/tullip-v0.3.0-debug.apk', releasePage:'https://github.com/sammmiksha/TULLIP/releases/tag/v0.3.0' };
test('unpublished or incomplete downloads never become a ready APK button',()=>{
 assert.equal(releaseReady({...candidate,available:false}),false);
 for(const field of ['sha256','sizeBytes','downloadUrl','version','releasePage'])assert.equal(releaseReady({...candidate,[field]:null}),false);
 assert.equal(releaseReady({...candidate,sizeBytes:1.2}),false);
 assert.equal(releaseReady(candidate),true);
});
test('only exact versioned TULLIP GitHub APK assets are accepted',()=>{
 for(const downloadUrl of ['https://example.com/tullip.apk','https://github.com/other/repo/releases/download/v0.3.0/a.apk','https://github.com/sammmiksha/TULLIP/releases/download/v0.2.0/a.apk',candidate.downloadUrl+'?token=private',candidate.downloadUrl.replace('.apk','.zip')])assert.equal(releaseReady({...candidate,downloadUrl}),false);
});
test('the checked-in release is either explicitly unavailable or complete',()=>{
 assert.ok(release.available===false||releaseReady(release));
});
