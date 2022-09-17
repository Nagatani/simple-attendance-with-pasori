// https://github.com/marioninc/webusb-felica

let startButton = document.getElementById('start');
let idmMessage = document.getElementById('idm');
let waitingMessage = document.getElementById('waiting');

async function sleep(msec) {
  return new Promise(resolve => setTimeout(resolve, msec));
}

async function send(device, data) {
  let uint8a = new Uint8Array(data);
  // console.log(">>>>>>>>>>");
  // console.log(uint8a);
  await device.transferOut(2, uint8a);
  await sleep(10);
}

async function receive(device, len) {
  // console.log("<<<<<<<<<<" + len);
  let data = await device.transferIn(1, len);
  // console.log(data);
  await sleep(10);
  let arr = [];
  for (let i = data.data.byteOffset; i < data.data.byteLength; i++) {
    arr.push(data.data.getUint8(i));
  }
  // console.log(arr);
  return arr;
}

async function session(device) {
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
    let idmStr = '';
    for (let i = 0; i < idm.length; i++) {
      if (idm[i] < 16) {
        idmStr += '0';
      }
      idmStr += idm[i].toString(16);
    }
    idmMessage.innerText = "Card Type: Felica  カードのIDm: " + idmStr;
    changeIdm(idmStr);

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
    let idtStr = '';
    for (let i = 0; i < idt.length; i++) {
      if (idt[i] < 16) {
        idtStr += '0';
      }
      idtStr += idt[i].toString(16);
    }
    idmMessage.innerText = "Card Type : MIFARE  カードのID: " + idtStr;
    changeIdm(idtStr);

    idmMessage.style.display = 'block';
    waitingMessage.style.display = 'none';
    return;
  } else {
    idmMessage.style.display = 'none';
    waitingMessage.style.display = 'block';
  }
}

startButton.addEventListener('click', async () => {
  let device;
  try {
    device = await navigator.usb.requestDevice({ filters: [{
      vendorId: 0x054c,
      productId: 0x06C3
    }]});
    console.log("open");
    await device.open();
  } catch (e) {
    console.log(e);
    alert(e);
    throw e;
  }
  try {
    console.log("selectConfiguration");
    await device.selectConfiguration(1);
    console.log("claimInterface");
    await device.claimInterface(0);
    console.log(device);
    startButton.style.display = 'none';
    waitingMessage.style.display = 'block';
    do {
      await session(device);
      await sleep(500);
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



// IDMの変更を検知する
let beforeIdm = ''

/**
 * IDMの変更を検知し、出席登録処理を呼び出す
 * @param {Felica IDM} idm 
 */
 const changeIdm = (idm) => {
  let favDialog = document.getElementById('favDialog')
  if (favDialog.open) return
  
  if (idm.length === 8 && idm !== beforeIdm) { // 文字長さのチェックをここで入れているが、動作状況を見て必要なら外す
    inputIdm.value = idm;
    beforeIdm = inputIdm.value;
    // inputIdm.value = "";
    console.log("IDm updated.");
    attend(idm);
  }
}