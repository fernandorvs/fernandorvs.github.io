
var globalMsgNum = 0x8000;

function calculateChecksum(cmd) {
	var checksum = 0;
	for(var i = 0; i < cmd.length; i++) {
		checksum = checksum ^ cmd.charCodeAt(i);
	}
	var hexsum = Number(checksum).toString(16).toUpperCase();
	if (hexsum.length < 2) {
		hexsum = ("00" + hexsum).slice(-2);
	}
	return hexsum;
}

function packetCmd(cmd, msgNum, idEquipo) {
	var commandStr = new String("");
	var commandStr  = ">" + cmd;
	if (idEquipo != "") {
		commandStr += ";#" + msgNum.toString(16).toUpperCase();
		commandStr += ";ID=" + idEquipo + ";*";
		commandStr += calculateChecksum(commandStr);
	}
	commandStr  += "<";
	return commandStr;
}

function parserMessage(message) {
	var output = [];	
	var re = />(.*?)(;#([\w]{4})|)?;ID=([\w]*)(;|)/gm;
	var m; while ((m = re.exec(message)) != null) {
		if (m.index === re.lastIndex) re.lastIndex++;
		var msgNum = null, deviceId = null, body;
		if (m[3]) msgNum = m[3];
		if (m[4]) deviceId = m[4];
		if (m[1]) body = m[1];
		var data = { 
			body: body, deviceId: deviceId, 
			msgNum: msgNum, sourcePacket: m[00]
		};

		output.push(data);
	}
	return output;
}

function getCleanCmds(message, idEquipo = null) {
	var output = [];	
	var re = />(.*?)</gm;
	var m; while ((m = re.exec(message)) != null) {
		if (m.index === re.lastIndex) re.lastIndex++;
		output.push({ data: packetCmd(m[1], globalMsgNum, idEquipo), nroMsg: globalMsgNum.toString(16).toUpperCase() });
		globalMsgNum = !(globalMsgNum >= 0x8000 && globalMsgNum < 0xFFFF) ? 0x8000 : globalMsgNum + 1;
	}
	return output;
}

