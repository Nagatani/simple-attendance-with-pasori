// https://github.com/marioninc/webusb-felica

const deviceFilters = [
  {
    vendorId: 0x054c,
    productId: 0x06C1,
    deviceModel: 380,
  },
  {
    vendorId: 0x054c,
    productId: 0x06C3,
    deviceModel: 380,
  },
  {
    vendorId: 0x054c,
    productId: 0x0dc8,
    deviceModel: 300,
  },
  {
    vendorId: 0x054c,
    productId: 0x0dc9,
    deviceModel: 300,
  },
];
const deviceModelList = {
  0x06C1: 380,
  0x06C3: 380,
  0x0dc8: 300,
  0x0dc9: 300,
};
let deviceModel;
let deviceEp = {
  in: 0,
  out: 0,
}
let seqNumber = 0 ;

const startButton = document.getElementById('start');
const idmMessage = document.getElementById('idm');
const waitingMessage = document.getElementById('waiting');

async function sleep(msec) {
  return new Promise(resolve => setTimeout(resolve, msec));
}

async function send(device, data) {
  let uint8a = new Uint8Array(data);
  console.log(">>>>>>>>>>");
  console.log(uint8a);
  await device.transferOut(deviceEp.out, uint8a);
  await sleep(100);
}
async function send300(device, data) {
  let argData = new Uint8Array(data);
  const dataLen = argData.length;
  const SLOTNUMBER = 0x00;
  let retVal = new Uint8Array( 10 + dataLen );

  retVal[0] = 0x6b ;            // ヘッダー作成
  retVal[1] = 255 & dataLen ;       // length をリトルエンディアン
  retVal[2] = dataLen >> 8 & 255 ;
  retVal[3] = dataLen >> 16 & 255 ;
  retVal[4] = dataLen >> 24 & 255 ;
  retVal[5] = SLOTNUMBER ;        // タイムスロット番号
  retVal[6] = ++seqNumber ;       // 認識番号

  0 != dataLen && retVal.set( argData, 10 ); // コマンド追加
  console.log(">>>>>>>>>>");
  console.log(Array.from(retVal).map(v => v.toString(16)));
  const out = await device.transferOut(deviceEp.out, retVal);
  await sleep(50);
}

async function receive(device, len) {
  console.log("<<<<<<<<<<" + len);
  let data = await device.transferIn(deviceEp.in, len);
  // console.log(data);
  await sleep(10);
  let arr = [];
  let arr_str = [];
  for (let i = data.data.byteOffset; i < data.data.byteLength; i++) {
    arr.push(data.data.getUint8(i));
    arr_str.push(dec2HexString(data.data.getUint8(i)));
  }
  console.log(arr_str);
  return arr;
}

async function session300(device) {
  let rcs300_com_length = 0;
  const len = 50;
  let header = [];
  // firmware version
  await send300(device, [0xFF, 0x56, 0x00, 0x00]);
  // ['83', '14', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '1', '0', '1', '0', 'ff', 'ff', '4', '1', 'ff', 'ff', '1', '0', 'ff', 'ff', '0', '0', '90', '0']
  await receive(device, len);

  // endtransparent
  await send300(device, [0xFF, 0x50, 0x00, 0x00, 0x02, 0x82, 0x00, 0x00]);
  // ['83', '07', '00', '00', '00', '00', '01', '02', '00', '00', 'C0', '03', '00', '90', '00', '90', '00']
  await receive(device, len);
  
  // startransparent
  await send300(device, [0xFF, 0x50, 0x00, 0x00, 0x02, 0x81, 0x00, 0x00]);
  // ['83', '07', '00', '00', '00', '00', '01', '02', '00', '00', 'C0', '03', '00', '90', '00', '90', '00']
  await receive(device, len);

  // rf off
  await send300(device, [0xFF, 0x50, 0x00, 0x00, 0x02, 0x83, 0x00, 0x00]);
  // ['83', '07', '00', '00', '00', '00', '01', '02', '00', '00', 'C0', '03', '00', '90', '00', '90', '00']
  await receive(device, len);

  // rf on
  await send300(device, [0xFF, 0x50, 0x00, 0x00, 0x02, 0x84, 0x00, 0x00]);
  // ['83', '07', '00', '00', '00', '00', '01', '02', '00', '00', 'C0', '03', '00', '90', '00', '90', '00']
  await receive(device, len);

  // SwitchProtocolTypeF
  await send300(device, [0xff, 0x50, 0x00, 0x02, 0x04, 0x8f, 0x02, 0x03, 0x00, 0x00]);
  // ['C0', '03', '00', '90', '00', '90', '00']
  await receive(device, len);

  // ferica poling
  await send300(device, [0xFF, 0x50, 0x00, 0x01, 0x00, 0x00, 0x11, 0x5F, 0x46, 0x04, 0xA0, 0x86, 0x01, 0x00, 0x95, 0x82, 0x00, 0x06, 0x06, 0x00, 0xFF, 0xFF, 0x01, 0x00, 0x00, 0x00, 0x00]);
  // poling検出時 *がIDm
  // ['83', '24', '00', '00', '00', '00', '06', '02', '00', '00']
  // ['C0', '03', '00', '90', '00', '92', '01', '00', '96', '02', '00', '00', '97', '14', '14', '01', '**', '**', '**', '**', '**', '**', '**', '**', '05', '31', '43', '45', '46', '82', 'B7', 'FF', '00', '03', '90', '00']
  // poling未検出時
  // ['83', '07', '00', '00', '00', '00', '98', '02', '00', '00']
  // ['C0', '03', '02', '64', '01', '90', '00']
  const poling_res_f = await receive(device, len);
  if(poling_res_f.length == 46){
    const idm = poling_res_f.slice(26,34).map(v => dec2HexString(v));
    const idmStr = idm.join('');
    idmMessage.innerText = "Card Type: Felica  カードのIDm: " + idmStr;
    updateIDm(idmStr); // ここでIDを送信する( customize: ADD Code )
    idmMessage.style.display = 'block';
    waitingMessage.style.display = 'none';
    return;
  }
  // SwitchProtocolTypeA
  await send300(device, [0xff, 0x50, 0x00, 0x02, 0x04, 0x8f, 0x02, 0x00, 0x03, 0x00]);
  // ['C0', '03', '00', '90', '00', '90', '00']
  await receive(device, len);
  
  // GET Card UID
  await send300(device, [0xff, 0xCA, 0x00, 0x00]);
  
  // poling検出時 *がIDm
  // ['83', '06', '00', '00', '00', '00', '04', '02', '00', '00']
  // ['**', '**', '**', '**', '90', '00']
  
  // ['83', '07', '00', '00', '00', '00', '41', '02', '00', '00']
  // ['C0', '03', '01', '64', '01', '90', '00']
  // or ['6F', '00']
  const poling_res_a = await receive(device, len);
  if (poling_res_a.length == 16) {
    const id = poling_res_a.slice(10,14).map(v => dec2HexString(v));
    const idStr = id.join('');
    idmMessage.innerText = "Card Type : MIFARE  カードのID: " + idStr;
    updateIDm(idStr); // ここでIDを送信する( customize: ADD Code )
    idmMessage.style.display = 'block';
    waitingMessage.style.display = 'none';
    return;
  }

  idmMessage.style.display = 'none';
  waitingMessage.style.display = 'block';
}
function get_header_length(header){
  return header[4] << 24 | header[3] << 16 | header[2] << 8 | header[1];
}

async function session380(device) {
  // INFO:nfc.clf:searching for reader on path usb:054c:06c3
  // DEBUG:nfc.clf.transport:using libusb-1.0.21
  // DEBUG:nfc.clf.transport:path matches '^usb(:[0-9a-fA-F]{4})(:[0-9a-fA-F]{4})?$'
  // DEBUG:nfc.clf.device:loading rcs380 driver for usb:054c:06c3
  // Level 9:nfc.clf.transport:>>> 0000ff00ff00
  await send(device, [0x00, 0x00, 0xff, 0x00, 0xff, 0x00]);

  // Level 9:nfc.clf.rcs380:SetCommandType 01
  // Level 9:nfc.clf.transport:>>> 0000ffffff0300fdd62a01ff00
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x03, 0x00, 0xfd, 0xd6, 0x2a, 0x01, 0xff, 0x00]);
  // Level 9:nfc.clf.transport:<<< 0000ff00ff00
  await receive(device, 6);
  // Level 9:nfc.clf.transport:<<< 0000ffffff0300fdd72b00fe00
  await receive(device, 13);

  // Level 9:nfc.clf.rcs380:GetFirmwareVersion
  // Level 9:nfc.clf.transport:>>> 0000ffffff0200fed6200a00
  // Level 9:nfc.clf.transport:<<< 0000ff00ff00
  // Level 9:nfc.clf.transport:<<< 0000ffffff0400fcd7211101f600
  // DEBUG:nfc.clf.rcs380:firmware version 1.11
  // Level 9:nfc.clf.rcs380:GetPDDataVersion
  // Level 9:nfc.clf.transport:>>> 0000ffffff0200fed6220800
  // Level 9:nfc.clf.transport:<<< 0000ff00ff00
  // Level 9:nfc.clf.transport:<<< 0000ffffff0400fcd72300010500
  // DEBUG:nfc.clf.rcs380:package data format 1.00

  // Level 9:nfc.clf.rcs380:SwitchRF 00
  // Level 9:nfc.clf.transport:>>> 0000ffffff0300fdd606002400
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x03, 0x00, 0xfd, 0xd6, 0x06, 0x00, 0x24, 0x00]);
  // Level 9:nfc.clf.transport:<<< 0000ff00ff00
  await receive(device, 6);
  // Level 9:nfc.clf.transport:<<< 0000ffffff0300fdd707002200
  await receive(device, 13);

  // Level 9:nfc.clf.rcs380:GetFirmwareVersion
  // Level 9:nfc.clf.transport:>>> 0000ffffff0200fed6200a00
  // Level 9:nfc.clf.transport:<<< 0000ff00ff00
  // Level 9:nfc.clf.transport:<<< 0000ffffff0400fcd7211101f600
  // DEBUG:nfc.clf.rcs380:firmware version 1.11
  // INFO:nfc.clf:using SONY RC-S380/P NFC Port-100 v1.11 at usb:020:014

  // Level 9:nfc.clf.rcs380:SwitchRF 00
  // Level 9:nfc.clf.transport:>>> 0000ffffff0300fdd606002400
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x03, 0x00, 0xfd, 0xd6, 0x06, 0x00, 0x24, 0x00]);
  // Level 9:nfc.clf.transport:<<< 0000ff00ff00
  await receive(device, 6);
  // Level 9:nfc.clf.transport:<<< 0000ffffff0300fdd707002200
  await receive(device, 13);
  // DEBUG:nfc.clf:sense 212F
  // DEBUG:nfc.clf.rcs380:polling for NFC-F technology

  // Level 9:nfc.clf.rcs380:InSetRF 01010f01
  // Level 9:nfc.clf.transport:>>> 0000ffffff0600fad60001010f011800
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x06, 0x00, 0xfa, 0xd6, 0x00, 0x01, 0x01, 0x0f, 0x01, 0x18, 0x00]);
  // Level 9:nfc.clf.transport:<<< 0000ff00ff00
  await receive(device, 6);
  // Level 9:nfc.clf.transport:<<< 0000ffffff0300fdd701002800
  await receive(device, 13);

  // Level 9:nfc.clf.rcs380:InSetProtocol 00180101020103000400050006000708080009000a000b000c000e040f001000110012001306
  // Level 9:nfc.clf.transport:>>> 0000ffffff2800d8d60200180101020103000400050006000708080009000a000b000c000e040f0010001100120013064b00
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x28, 0x00, 0xd8, 0xd6, 0x02, 0x00, 0x18, 0x01, 0x01, 0x02, 0x01, 0x03, 0x00, 0x04, 0x00, 0x05, 0x00, 0x06, 0x00, 0x07, 0x08, 0x08, 0x00, 0x09, 0x00, 0x0a, 0x00, 0x0b, 0x00, 0x0c, 0x00, 0x0e, 0x04, 0x0f, 0x00, 0x10, 0x00, 0x11, 0x00, 0x12, 0x00, 0x13, 0x06, 0x4b, 0x00]);
  // Level 9:nfc.clf.transport:<<< 0000ff00ff00
  await receive(device, 6);
  // Level 9:nfc.clf.transport:<<< 0000ffffff0300fdd703002600
  await receive(device, 13);

  // Level 9:nfc.clf.rcs380:InSetProtocol 0018
  // Level 9:nfc.clf.transport:>>> 0000ffffff0400fcd60200181000
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x04, 0x00, 0xfc, 0xd6, 0x02, 0x00, 0x18, 0x10, 0x00]);
  // Level 9:nfc.clf.transport:<<< 0000ff00ff00
  await receive(device, 6);
  // Level 9:nfc.clf.transport:<<< 0000ffffff0300fdd703002600
  await receive(device, 13);
  // DEBUG:nfc.clf.rcs380:send SENSF_REQ 00ffff0100

  // Level 9:nfc.clf.rcs380:InCommRF 6e000600ffff0100
  // Level 9:nfc.clf.transport:>>> 0000ffffff0a00f6d6046e000600ffff0100b300
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x0a, 0x00, 0xf6, 0xd6, 0x04, 0x6e, 0x00, 0x06, 0x00, 0xff, 0xff, 0x01, 0x00, 0xb3, 0x00]);
  // Level 9:nfc.clf.transport:<<< 0000ff00ff00
  await receive(device, 6);
  // Level 9:nfc.clf.transport:<<< 0000ffffff1b00e5d70500000000081401000000000000000000000000000000000000f700
  let idm = (await receive(device, 37)).slice(17, 25);
  if (idm.length > 0) {
    const idmStr = idm.map(v => dec2HexString(v)).join('');
    idmMessage.innerText = "Card Type: Felica  カードのIDm: " + idmStr;
    updateIDm(idmStr); // ここでIDを送信する( customize: ADD Code )
    idmMessage.style.display = 'block';
    waitingMessage.style.display = 'none';
    return;
  }

  // DEBUG:nfc.clf.rcs380:rcvd SENSF_RES 01000000000000000000000000000000000000
  // DEBUG:nfc.clf:found 212F sensf_res=01000000000000000000000000000000000000
  // 212F sensf_res=01000000000000000000000000000000000000
  // DEBUG:nfc.tag:trying to activate 212F sensf_res=01000000000000000000000000000000000000
  // DEBUG:nfc.tag:trying type 3 tag activation for 212F
  // Type3Tag 'FeliCa Standard' ID=000000000000000 PMM=0000000000000000 SYS=0000
  // 0000000000000000
  // Level 9:nfc.clf.rcs380:SwitchRF 00
  // Level 9:nfc.clf.transport:>>> 0000ffffff0300fdd606002400
  // Level 9:nfc.clf.transport:<<< 0000ff00ff00
  // Level 9:nfc.clf.transport:<<< 0000ffffff0300fdd707002200
  // Level 9:nfc.clf.transport:>>> 0000ff00ff00


  await send(device,[0x00,0x00,0xff,0xff,0xff,0x03,0x00,0xfd,0xd6,0x06,0x00,0x24,0x00]);
  await receive(device, 6);
  await receive(device, 13);
  // <<< 0000ffffff0300fdd707002200
  
  await send(device,[0x00,0x00,0xff,0xff,0xff,0x06,0x00,0xfa,0xd6,0x00,0x02,0x03,0x0f,0x03,0x13,0x00]);
  await receive(device, 6);
  await receive(device, 13);
  // <<< 0000ffffff0300fdd701002800
  
  await send(device, [0x00, 0x00, 0xff, 0xff, 0xff, 0x28, 0x00, 0xd8, 0xd6, 0x02, 0x00, 0x18, 0x01, 0x01, 0x02, 0x01, 0x03, 0x00, 0x04, 0x00, 0x05, 0x00, 0x06, 0x00, 0x07, 0x08, 0x08, 0x00, 0x09, 0x00, 0x0a, 0x00, 0x0b, 0x00, 0x0c, 0x00, 0x0e, 0x04, 0x0f, 0x00, 0x10, 0x00, 0x11, 0x00, 0x12, 0x00, 0x13, 0x06, 0x4b, 0x00]);
  await receive(device, 6);
  await receive(device, 13);
  // <<< 0000ffffff0300fdd703002600

  await send(device, [0x00,0x00,0xff,0xff,0xff,0x0c,0x00,0xf4,0xd6,0x02,0x01,0x00,0x02,0x00,0x05,0x01,0x00,0x06,0x07,0x07,0x0b,0x00]);
  await receive(device, 6);
  await receive(device, 13);
  // <<< 0000ffffff0300fdd703002600

  await send(device, [0x00,0x00,0xff,0xff,0xff,0x05,0x00,0xfb,0xd6,0x04,0x36,0x01,0x26,0xc9,0x00]);
  await receive(device, 6);
  await receive(device, 20);
  // <<< 0000ffffff0900f7d705000000000804001800

  await send(device, [0x00,0x00,0xff,0xff,0xff,0x06,0x00,0xfa,0xd6,0x02,0x04,0x01,0x07,0x08,0x14,0x00]);
  await receive(device, 6);
  await receive(device, 13);
  // <<< 0000ffffff0300fdd703002600

  await send(device, [0x00,0x00,0xff,0xff,0xff,0x06,0x00,0xfa,0xd6,0x02,0x01,0x00,0x02,0x00,0x25,0x00]);
  await receive(device, 6);
  await receive(device, 13);
  // <<< 0000ffffff0300fdd703002600

  await send(device, [0x00,0x00,0xff,0xff,0xff,0x06,0x00,0xfa,0xd6,0x04,0x36,0x01,0x93,0x20,0x3c,0x00]);
  await receive(device, 6);
  let idt = (await receive(device, 22)).slice(15, 19);
  // <<< 0000ffffff0c00f4d705000000000800000000490c00
  if (idt.length > 2) {
    const id = idt.map(v => dec2HexString(v));
    const idtStr = id.join('');
    idmMessage.innerText = "Card Type : MIFARE  カードのID: " + idtStr;
    updateIDm(idtStr); // ここでIDを送信する( customize: ADD Code )
    idmMessage.style.display = 'block';
    waitingMessage.style.display = 'none';
    return;
  }
  idmMessage.style.display = 'none';
  waitingMessage.style.display = 'block';
}

startButton.addEventListener('click', async () => {
  let device;
  try {
    console.log(navigator);
    // ペアリング済みの対応デバイスが1つだったら、自動選択にする
    let pearedDevices = await navigator.usb.getDevices();
    pearedDevices = pearedDevices.filter(d => deviceFilters.map(p => p.productId).includes(d.productId));
    // 自動選択 or 選択画面
    device = pearedDevices.length == 1 ? pearedDevices[0] : await navigator.usb.requestDevice({ filters: deviceFilters});
    deviceModel = deviceModelList[device.productId];
    console.log("open");
    await device.open();
    console.log(device);
  } catch (e) {
    console.log(e);
    alert(e);
    throw e;
  }
  try {
    console.log("selectConfiguration");
    await device.selectConfiguration(1);
    console.log("claimInterface");
    console.log(device);
    const interface = device.configuration.interfaces.filter(v => v.alternate.interfaceClass == 255)[0];
    await device.claimInterface(interface.interfaceNumber);
    deviceEp = {
      in: interface.alternate.endpoints.filter(e => e.direction == 'in')[0].endpointNumber,
      out: interface.alternate.endpoints.filter(e => e.direction == 'out')[0].endpointNumber,
    }
    startButton.style.display = 'none';
    waitingMessage.style.display = 'block';
    do {
      deviceModel == 300 ? await session300(device) : await session380(device);
      await sleep(100);
    } while (true);
  } catch (e) {
    console.log(e);
    alert(e);
    try {
      device.close();
    } catch (e) {
      console.log(e);
    }
    startButton.style.display = 'block';
    waitingMessage.style.display = 'none';
    idmMessage.style.display = 'none';
    throw e;
  }
});
function padding_zero(num,p){
  return ("0".repeat(p*1) + num).slice(-(p*1));
}
function dec2HexString(n){
  return padding_zero((n*1).toString(16).toUpperCase(),2);
}


// IDMの変更を検知する
let beforeIdm = ''

/**
 * IDMの変更を検知し、出席登録処理を呼び出す
 * @param {Felica IDM} idm 
 */
 const updateIDm = (idm) => {

  const sound = document.getElementById('read_sound')
  sound.currentTime = 0
  sound.muted = false
  sound.play()

  let favDialog = document.getElementById('favDialog')
  if (favDialog.open) return
  
  if (inputIdm && idm.length === 8 && idm !== beforeIdm) { // 文字長さのチェックをここで入れているが、動作状況を見て必要なら外す
    inputIdm.value = idm;
    beforeIdm = inputIdm.value;
    // inputIdm.value = "";
    console.log("IDm updated.");
    attend(idm);
  }
}