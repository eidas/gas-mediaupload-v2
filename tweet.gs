
// API v2 用コード

// 以下のCLIENT_ID, CLIENT_SECRETはtwitter APIの管理画面から取得する
const ScriptProperties = PropertiesService.getScriptProperties();
const CLIENT_ID = ScriptProperties.getProperty('CLIENT_ID');
const CLIENT_SECRET = ScriptProperties.getProperty('CLIENT_SECRET');

/**
 * Create the OAuth2 Twitter Service
 * @return OAuth2 service
 */
function getService_v2() {
  pkceChallengeVerifier();
  const userProps = PropertiesService.getUserProperties();
  const scriptProps = PropertiesService.getScriptProperties();
  return OAuth2.createService('twitter')
    .setAuthorizationBaseUrl('https://twitter.com/i/oauth2/authorize')
    .setTokenUrl('https://api.twitter.com/2/oauth2/token?code_verifier=' + userProps.getProperty("code_verifier"))
    .setClientId(CLIENT_ID)
    .setClientSecret(CLIENT_SECRET)
    .setCallbackFunction('authCallback_v2')
    .setPropertyStore(userProps)
    .setScope('users.read tweet.read tweet.write offline.access media.write')
    // .setScope('users.read tweet.read tweet.write offline.access')
    .setParam('response_type', 'code')
    .setParam('code_challenge_method', 'S256')
    .setParam('code_challenge', userProps.getProperty("code_challenge"))
    .setTokenHeaders({
      'Authorization': 'Basic ' + Utilities.base64Encode(CLIENT_ID + ':' + CLIENT_SECRET),
      'Content-Type': 'application/x-www-form-urlencoded'
    })
}

/**
 * Reset the OAuth2 Twitter Service
 */
function reset_v2() {
    getService_v2().reset();
    PropertiesService.getUserProperties().deleteProperty("code_challenge");
    PropertiesService.getUserProperties().deleteProperty("code_verifier");
  }
  
/**
 * Handles the OAuth callback.
 */
function authCallback_v2(request) {
  const service = getService_v2();
  const authorized = service.handleCallback(request);
  if (authorized) {
    return HtmlService.createHtmlOutput('Success!');
  } else {
    return HtmlService.createHtmlOutput('Denied.');
  }
}

/**
 * Generate PKCE Challenge Verifier for Permission for OAuth2 Twitter Service
 */
function pkceChallengeVerifier() {
  var userProps = PropertiesService.getUserProperties();
  if (!userProps.getProperty("code_verifier")) {
    var verifier = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

    for (var i = 0; i < 128; i++) {
      verifier += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    var sha256Hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, verifier)

    var challenge = Utilities.base64Encode(sha256Hash)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    userProps.setProperty("code_verifier", verifier)
    userProps.setProperty("code_challenge", challenge)
  }
}

function logRedirectUri() {
  const service = getService_v2();
  Logger.log(service.getRedirectUri());
}

// 初回のみ実行するコード (認証を実行)
function runWhenFirstTime() {
  const service = getService_v2();
  if (service.hasAccess()) {
    Logger.log("Already authorized");
  } else {
    const authorizationUrl = service.getAuthorizationUrl();
    Logger.log('Open the following URL and re-run the script: %s', authorizationUrl);
  }
}

function sendTestTweet() {
  let payload = {
    text: 'Test. '
  }

  const service = getService_v2();
  if (service.hasAccess()) {
    let url = `https://api.twitter.com/2/tweets`;
    let response = UrlFetchApp.fetch(url, {
      method: 'POST',
      'contentType': 'application/json',
      headers: {
        Authorization: 'Bearer ' + service.getAccessToken()
      },
      muteHttpExceptions: true,
      payload: JSON.stringify(payload)
    });
    let result = JSON.parse(response.getContentText());
    Logger.log(JSON.stringify(result, null, 2));
  } else {
    let authorizationUrl = service.getAuthorizationUrl();
    Logger.log('Open the following URL and re-run the script: %s',authorizationUrl);
  }
}


/// twitterへ投稿する(API v2)
/// - msg : ツイートに入れるテキスト
/// - re_id : 返信するツイートID (返信でない時はnullにする)
/// - img_urls : 画像のURLの配列
/// 返り値はツイートした投稿のID
function post_tweet_v2(msg, re_id, img_urls){
  const service  = getService_v2();
  
  // media_idの取得
  let img_ids = [];
  if (img_urls && img_urls.length > 0) {
    // img_ids = media_upload(img_urls);
    img_ids = media_upload_v2(img_urls); // 2025.03.31のmedia upload API v1.1終了に伴いAPI v2に移行
  }

  // ツイートの本体データ
  let payload = "";
  if (img_ids && img_ids.length >0 ) {
    payload = {
      'text': msg,
      "media":{
          "media_ids": img_ids
      }
    };
  } else {
    payload = {
      'text': msg
    };
  }

  // ツイートの投稿
  let result ="";
  if (service.hasAccess()) {
    const url = `https://api.twitter.com/2/tweets`;
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      'contentType': 'application/json',
      headers: {
        Authorization: 'Bearer ' + service.getAccessToken()
      },
      muteHttpExceptions: true,
      payload: JSON.stringify(payload)
    });
    result = JSON.parse(response.getContentText());
    Logger.log(JSON.stringify(result, null, 2));
  } else {
    const authorizationUrl = service.getAuthorizationUrl();
    Logger.log('Open the following URL and re-run the script: %s',authorizationUrl);
  }

  // tw_id = JSON.parse(response).id_str;
  // return tw_id;
}

// API v2でupload
function media_upload_v2(img_urls) {
  const service  = getService_v2();
  const bearerToken = service.getAccessToken();
  let img_ids = [];

  // 画像を順番にアップロードする
  for(let i = 0; i < img_urls.length; i++){
    const media_id = uploadImageToXFromUrl(img_urls[i], bearerToken);
    img_ids[i] = media_id;
  }
  return img_ids;
}


function uploadImageToXFromUrl(img_url, bearerToken) {

  Logger.log(`${img_url} の media upload 開始`);

  // Google Driveから画像ファイルを取得
  let blob = UrlFetchApp.fetch(img_url).getBlob();
  const fileName = blob.getName();
  const mimeType = blob.getContentType();
  const fileSize = blob.getBytes().length;
  const fileData = blob.getBytes();

  const apiUrl = 'https://api.x.com/2/media/upload';
  const mediaCategory = 'tweet_image'; // 画像の用途 

  // --- INITフェーズ ---
  const initPayload = {
    command: 'INIT',
    media_type: mimeType,
    total_bytes: fileSize,
    media_category: mediaCategory
  };

  const initOptions = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + bearerToken,
      'Content-Type': 'application/x-www-form-urlencoded' // または 'multipart/form-data'
    },
    payload: Object.keys(initPayload).map(function(key){
      return encodeURIComponent(key) + '=' + encodeURIComponent(initPayload[key]);
    }).join('&')
  };

  const initResponse = UrlFetchApp.fetch(apiUrl, initOptions);
  const initResponseJson = JSON.parse(initResponse.getContentText());
  const mediaId = initResponseJson.data.id;
  Logger.log('INITフェーズ 成功');


  // --- APPENDフェーズ ---
  const chunkSize = 1024 * 1024; // 1MBのチャンクサイズ (調整可能) 
  let segmentIndex = 0;
  for (let i = 0; i < fileSize; i += chunkSize) {
    const chunk = fileData.slice(i, Math.min(i + chunkSize, fileSize));
    const appendPayload = {
      command: 'APPEND',
      media_id: mediaId,
      segment_index: segmentIndex.toString(),
      media: Utilities.newBlob(chunk, mimeType, fileName)
    };

    const appendOptions = {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + bearerToken
      },
      payload: appendPayload
    };

    try {
      const appendResponse = UrlFetchApp.fetch(apiUrl, appendOptions);
      // APPENDフェーズのレスポンスは通常空です [1]
      if (appendResponse.getResponseCode() >= 200 && appendResponse.getResponseCode() < 300) {
        Logger.log('APPENDフェーズ (index ' + segmentIndex + ') 成功');
      } else {
        Logger.log('APPENDフェーズ (index ' + segmentIndex + ') でエラーが発生しました: ' + appendResponse.getContentText());
        return;
      }
    } catch (e) {
      Logger.log('APPENDフェーズ (index ' + segmentIndex + ') でエラーが発生しました: ' + e);
      Logger.log(appendOptions);
      return;
    }
    segmentIndex++;
  }

  // --- FINALIZEフェーズ ---
  const finalizePayload = {
    command: 'FINALIZE',
    media_id: mediaId
  };

  const finalizeOptions = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + bearerToken,
      'Content-Type': 'application/x-www-form-urlencoded' // または 'multipart/form-data'
    },
    payload: Object.keys(finalizePayload).map(function(key){
      return encodeURIComponent(key) + '=' + encodeURIComponent(finalizePayload[key]);
    }).join('&')
  };

  const finalizeResponse = UrlFetchApp.fetch(apiUrl, finalizeOptions);
  const finalizeResponseJson = JSON.parse(finalizeResponse.getContentText());
  Logger.log('FINALIZEレスポンス: ' + JSON.stringify(finalizeResponseJson));
  let mediaKey = finalizeResponseJson.data.media_key;

  // --- STATUSフェーズ (必要に応じて) ---
  if (finalizeResponseJson.data.processing_info) {
    const checkAfterSecs = finalizeResponseJson.data.processing_info.check_after_secs;
    const statusUrl = apiUrl + '?command=STATUS&media_id=' + mediaId;
    Logger.log('処理状況を確認します...');
    Utilities.sleep(checkAfterSecs * 1000); // 推奨される待機時間

    let statusOptions = {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + bearerToken
      }
    };

    let statusResponse;
    let statusResponseJson;
    do {
      statusResponse = UrlFetchApp.fetch(statusUrl, statusOptions);
      statusResponseJson = JSON.parse(statusResponse.getContentText());
      Logger.log('STATUSレスポンス: ' + JSON.stringify(statusResponseJson));
      if (statusResponseJson.data.processing_info.state === 'succeeded') {
        Logger.log('メディアの処理が完了しました。media_key: ' + mediaKey);
        return mediaId;
        break;
      } else if (statusResponseJson.data.processing_info.state === 'failed') {
        Logger.log('メディアの処理に失敗しました: ' + JSON.stringify(statusResponseJson.data.processing_info.errors));
        return;
      }
      Utilities.sleep(statusResponseJson.data.processing_info.check_after_secs * 1000);
    } while (statusResponseJson.data.processing_info.state !== 'succeeded');
  } else {
    Logger.log('メディアの処理は完了しました。media_key: ' + mediaKey);
    return mediaId;
  }
}
