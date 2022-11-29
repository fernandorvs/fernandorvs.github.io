
const version = 0;
const subversion = 3;

const RXCOLOR = "255";
const ERRCOLOR = "C00";
const TXCOLOR = "884";

var consoleLinesTop = 1000;
var consoleLines = [];
var renderFlag = false;

var esperaAck = null;
var tiempoDeReintentos = 0;
var to = null;
var filename = "rinho_config.txt";

var SerialPortIsOpen = false;
var port;
let reader;

class LineBreakTransformer {
	constructor() {
		this.container = "";
	}
	transform(chunk, controller) {
		this.container += chunk;
		const lines = this.container.split('\r\n');
		this.container = lines.pop();
		lines.forEach(line => controller.enqueue(line));
	}
	flush(controller) {
		controller.enqueue(this.container);
	}
}

function processData(data) {
	var dins = parserMessage(data);
	for (var i = dins.length - 1; i >= 0; i--) {
		if ($$('idEquipo').getValue() == "") $$('idEquipo').setValue(dins[i].deviceId);
		if (dins[i].msgNum != null) {
			if (esperaAck != null && esperaAck == dins[i].msgNum) {
				esperaAck = null;
			}
		}
	}
	log(data, RXCOLOR);
}

async function openSerial(openCallback, receiveCallback, disconnectCallback) {
	try {
		port = await navigator.serial.requestPort();
		await port.open({
			baudRate: $$('selectBaudrate').getValue(),
			dataBits: 8,
			stopBits: 1,
			parity: "none",
			buffersize: 100000,
			bufferSize: 100000,
			flowControl: "none"
		});
		openCallback(port);
		setTimeout(async () => {
			while (port.readable && SerialPortIsOpen) {
				reader = port.readable
					.pipeThrough(new TextDecoderStream())
					.pipeThrough(new TransformStream(new LineBreakTransformer()))
					.getReader();
				try {
					while (SerialPortIsOpen) {
						const {value, done} = await reader.read();
						if (done) {
							reader.releaseLock();
							disconnectCallback();
							break;
						}
						if (value) receiveCallback(value);
					}
				} catch (error) {
					console.log(error);
					disconnectCallback(error);
				} finally {
					reader.releaseLock();
				}
			}
		}, 1000);
	} catch (e) {
		console.log(e);
		disconnectCallback(e);
	}
}

async function closeSerial() {
	if (port) {
		reader.cancel().then(async function () {
			await port.forget();
			reader = undefined;
			port = undefined;
		});
	}
}

async function writeSerialText(data) {
	try {
		const encoder = new TextEncoder();
		const writer = port.writable.getWriter();
		await writer.write(encoder.encode(data));
		writer.releaseLock();
	} catch (e) {
		log(e, ERRCOLOR);
	}
}

async function writeSerial(data) {
	try {
		const writer = port.writable.getWriter();
		data = new Uint8Array(data);
		await writer.write(data);
		writer.releaseLock();
	} catch (e) {
		log(e, ERRCOLOR);
	}
}

function playSound(filename) {
	var audio = new Audio('sounds/' + filename);
	audio.play();
}

function openFileDialog() {
	let input = document.createElement('input');
	input.type = 'file';
	input.onchange = _ => {
		let files = Array.from(input.files);
		file = files[0];
		filename = file.name;
		var reader = new FileReader();
		reader.readAsText(file, 'UTF-8');
		reader.onload = readerEvent => {
			var content = readerEvent.target.result;
			$$('archivoText').setValue(content);
			saveLocalStore();
		}
	};
	input.click();
}

function saveFileDialog() {
	var element = document.createElement('a');
	var text = $$('archivoText').getValue();
	element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
	console.log(filename);
	element.setAttribute('download', filename);
	element.style.display = 'none';
	document.body.appendChild(element);
	element.click();
	document.body.removeChild(element);
}

function log(data, color = null) {
	try {
		data = data.toString().replace("\n", "").replace("\r", "");
		consoleLines.push({data: data, color: color});
		if (consoleLines.length > consoleLinesTop) consoleLines.shift();
		renderFlag = true;
	} catch (error) {
		console.log(error);
	}
}

function renderLog() {
	if (renderFlag) {
		renderFlag = false;
		var salida = String("");
		for (var i = 0; i < consoleLines.length; i++) {
			salida += consoleLines[i].color != null ? ("<span style='color: #" +
				consoleLines[i].color + "'>" +
				consoleLines[i].data + "</span>") : consoleLines[i].data;
			salida += "\r\n";
		}
		var ta = $$("dataInText");
		ta.getNode().innerHTML = "<div style='padding: 5px'>" + salida + "</div>";
		if (consoleLines.length > consoleLinesTop) consoleLines.shift();
		// Scroll Fin
		var textarea = $$('dataInText').$view;
		textarea.scrollTop = textarea.scrollHeight;
	}
	setTimeout(renderLog, 100);
}

function saveLocalStore() {
	webix.storage.local.put('comandos', $$('commandList').data.serialize());
	webix.storage.local.put('configuracion_comandos', $$('archivoText').getValue());
	webix.storage.local.put('baudrate', $$('selectBaudrate').getValue());
	webix.storage.local.put('toolbarListadoComandos_isVisible', $$('toolbarListadoComandos').isVisible());
	webix.storage.local.put('panelArchivo_isVisible', $$('panelArchivo').isVisible());
}

function consoleOn() {
	playSound("Speech On.wav");
	$$('conectaBtn').define('label', 'Desconectar');
	$$('conectaBtn').refresh();
	$$('selectBaudrate').disable();
	$$('selectBaudrate').refresh();
	log("Puerto Abierto.");
	SerialPortIsOpen = true;
}

function consoleOff() {
	playSound("Speech Off.wav");
	$$('conectaBtn').define('label', 'Conectar');
	$$('conectaBtn').refresh();
	$$('selectBaudrate').enable();
	log("Puerto Cerrado.");
	SerialPortIsOpen = false;
}

function cleanConsole() {
	consoleLines = [];
	renderFlag = true;
}

async function connectSerialPort() {
	if (SerialPortIsOpen == false) {
		openSerial((data) => {
			consoleOn();
		}, (data) => {
			processData(data);
		}, (msg) => {
			log(msg, ERRCOLOR);
		});
	} else {
		closeSerial();
		consoleOff();
	}
}

async function sendCommand(data) {
	if (!SerialPortIsOpen) {
		log("Error al intentar enviar mensajes al puerto.", ERRCOLOR);
		return;
	}
	let dataOut = (data != null ? data : $$("comandoText").getValue()) + "\r\n";
	if (data != null) log(data + "\r", TXCOLOR);
	writeSerialText(dataOut);
}

function sendEscape() {
	if (!SerialPortIsOpen) {
		log("Error al intentar enviar mensajes al puerto.", ERRCOLOR);
		return;
	}
	writeSerial([0x1B]);
}

webix.ready(async function () {

	var nvsConfigCmds = webix.storage.local.get("configuracion_comandos");
	var commands = webix.storage.local.get("comandos");
	if (commands == null) {
		var commands = [
			{id: 1, Comando: ">QIO<"},
			{id: 2, Comando: ">QCQ<"},
			{id: 3, Comando: ">SDB1<"},
			{id: 4, Comando: ">SDB2<"},
			{id: 5, Comando: ">SDB0<"}
		];
	}

	webix.ui({
		rows: [{
			view: "toolbar",
			margin: 0,
			elements: [{
				id: 'conectaBtn',
				view: "button",
				icon: "plug",
				type: "iconButton",
				label: "Conectar",
				width: 130,
				click: connectSerialPort,
				align: "center"
			},
			{
				id: 'selectBaudrate',
				view: "select",
				type: "iconButton",
				label: null,
				width: 100,
				value: webix.storage.local.get("baudrate"),
				options: [
					{id: 4800, value: 4800},
					{id: 9600, value: 9600},
					{id: 19200, value: 19200},
					{id: 115200, value: 115200}
				]
			},
			{},
			{
				view: "button",
				icon: "th-list",
				type: "icon",
				label: "Comandos",
				width: 100,
				click: function () {
					if ($$('toolbarListadoComandos').isVisible()) {
						$$('toolbarListadoComandos').hide();
						$$('toolbarListadoComandosResizer').hide();
					} else {
						$$('toolbarListadoComandos').show();
						$$('toolbarListadoComandosResizer').show();
					}
				}, align: "right"
			},
			{
				view: "button",
				icon: "file-o",
				type: "icon",
				label: "Archivo",
				width: 100,
				click: function () {
					if ($$('panelArchivo').isVisible()) {
						$$('panelArchivo').hide();
						$$('panelArchivoResizer').hide();
					} else {
						$$('panelArchivo').show();
						$$('panelArchivoResizer').show();
					}
				}, align: "right"
			},
			{
				view: "button",
				icon: "info",
				type: "icon",
				width: 30,
				align: "right",
				click: function () {
					webix.modalbox({
						title: "<b>Rinho Web Serial</b>",
						buttons: ["Ok"],
						width: "500px",
						text:
							"Version: " + version + "." + subversion + "<br/>" +
							"<a target='_blank' href='http://www.rinho.com.ar/'>Rinho AVL</a> </br>"
					});
				}
			}]
		},
		{
			id: 'comms',
			margin: 0,
			cols: [{
				rows: [{
					cols: [{
						rows: [{
							cols: [{
								id: "toolbarListadoComandos",
								hidden: !webix.storage.local.get("toolbarListadoComandos_isVisible"),
								rows: [{
									view: "toolbar",
									paddingY: 1,
									height: 40,
									columns: [{
										id: "title",
										fillspace: true
									},
									{
										id: "Icons Buttons",
										width: 200,
										template: "<span class='webix_icon fa-user'></span> <span class='webix_icon fa-cog'></span>"
									}],
									elements: [{
										view: "button",
										type: "icon",
										icon: "plus-circle",
										label: "",
										width: 30,
										click: function () {
											var e = $$('commandList').add({Comando: ''});
											var cl = $$('commandList');
											cl.select(e);
											cl.showItem(e);
											cl.editRow(e);
										}
									},
									{
										view: "button",
										type: "icon",
										icon: "edit",
										label: "",
										width: 30,
										click: function () {
											$$("commandList").edit($$("commandList").getSelectedId());
										}
									},
									{
										view: "button",
										type: "icon",
										icon: "trash-o",
										label: "Limpiar",
										width: 30,
										click: function () {
											$$("commandList").remove($$("commandList").getSelectedId());
											saveLocalStore();
										}
									}, {},
									{
										view: "button",
										type: "icon",
										icon: "download",
										label: "Importar",
										width: 30,
										click: function () {
											var element = document.createElement('a');
											var text = JSON.stringify(commands);
											element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
											element.setAttribute('download', "commands.json");
											element.style.display = 'none';
											document.body.appendChild(element);
											element.click();
											document.body.removeChild(element);
										}
									},
									{
										view: "button",
										type: "icon",
										icon: "upload",
										label: "Importar",
										width: 30,
										click: function () {
											let input = document.createElement('input');
											input.type = 'file';
											input.onchange = _ => {
												let files = Array.from(input.files);
												file = files[0];
												filename = file.name;
												var reader = new FileReader();
												reader.readAsText(file, 'UTF-8');
												reader.onload = readerEvent => {
													var content = readerEvent.target.result;
													commands = JSON.parse(content);
													$$("commandList").parse(content);
													$$("commandList").refresh();
													saveLocalStore();
												}
											};
											input.click();
										}
									},
									]
								},
								{
									id: 'commandList',
									width: 200,
									view: "datatable",
									header: false,
									autoWidth: true,
									drag: true,
									data: commands,
									autoConfig: true,
									// columns: [
									// 	{
									// 		id: "Comando", header: "Comando",
									// 		fillspace: true,
									// 	},
									// ],
									on: {
										'onItemClick': function (id, e, trg) {
											var record = $$('commandList').getItem(id.row);
											sendCommand(record.Comando);
										},
										'onAfterEditStop': function (result) {
											saveLocalStore();
										},
										'onSelectChange': function (result) {
											$$('commandList').editCancel();
										},
										'onBlur': function (result) {
											$$('commandList').editCancel();
										}
									}
								}
								]
							},
							{
								id: "toolbarListadoComandosResizer",
								view: "resizer",
								hidden: !webix.storage.local.get("toolbarListadoComandos_isVisible")
							},
							{
								id: "dataInText",
								header: 'Consola',
								container: "consoladiv",
								view: "template", label: null, scroll: "xy", css: "consolaFondo"
							}]
						},
						{
							cols: [{
								id: "toolbarComando",
								view: "toolbar",
								paddingY: 0,
								height: 40,
								elements: [{
									id: "comandoText",
									view: "text",
									tooltip: "Enviar",
									value: '>QIO<',
									label: "Comando",
									height: 40,
									gravity: 1
								},
								{
									id: 'sendBtn',
									view: "button",
									label: "Enviar",
									type: "icon",
									icon: "paper-plane",
									width: 30,
									click: function () {
										sendCommand($$("comandoText").getValue());
									}
								},
								{
									id: 'escBtn',
									view: "button",
									tooltip: "Escape",
									type: "icon",
									icon: "exclamation",
									width: 30,
									click: sendEscape
								},
								{
									id: 'limpiaConsolaBtn',
									tooltip: "Limpiar Consola",
									view: "button",
									icon: "trash-o",
									type: "icon",
									label: "Limpiar",
									width: 30,
									click: cleanConsole,
									align: "center"
								}
								]
							}]
						}]
					},

					{
						id: "panelArchivoResizer",
						view: "resizer",
						hidden: !webix.storage.local.get("panelArchivo_isVisible")
					},

					{
						gravity: 0.8,
						id: 'panelArchivo',
						hidden: !webix.storage.local.get("panelArchivo_isVisible"),
						rows: [{
							id: 'archivoId',
							view: "toolbar",
							paddingY: 1,
							elements: [{
								view: "button",
								id: "openBtn",
								type: "icon",
								label: "Abrir",
								icon: "folder-open-o",
								width: 75,
								click: function () {
									openFileDialog();
								}
							},
							{
								view: "button",
								id: "saveAsBtn",
								type: "icon",
								label: "Guardar",
								icon: "floppy-o",
								width: 90,
								click: function (e) {
									saveFileDialog();
								}
							},
							{
								id: "btnArchivoEnviar",
								view: "button",
								type: "icon",
								icon: "paper-plane",
								label: "Enviar",
								width: 100,
								click: function () {
									if ($$('btnArchivoEnviar').config.label == "Detener") {
										stopProcess();
										return;
									}
									var lineas;
									var i;
									var sinID = false;
									function stopProcess() {
										playSound("beep_short_off.wav");
										$$("archivoText").showProgress({
											hide: true
										});
										$$('archivoText').enable();
										$$('toolbarComando').enable();
										$$('toolbarListadoComandos').enable();
										$$('btnArchivoEnviar').define('label', 'Enviar');
										$$('btnArchivoEnviar').refresh();
										clearInterval(to);
									}
									function startProcess() {
										playSound("beep_short_on.wav");
										$$("archivoText").showProgress({
											hide: false
										});
										$$('archivoText').disable();
										$$('toolbarComando').disable();
										$$('toolbarListadoComandos').disable();
										if ($$('idEquipo').getValue() == "") sinID = true;
										var data = $$('archivoText').getValue();
										lineas = getCleanCmds(data, $$('idEquipo').getValue());
										i = 0;
										esperaAck = null;
										$$('btnArchivoEnviar').define('label', 'Detener');
										$$('btnArchivoEnviar').refresh();
									}
									startProcess();
									to = setInterval(function () {
										if (esperaAck == null || sinID) {
											sendCommand(lineas[i].data);
											tiempoDeReintentos = (new Date()).getTime();
											esperaAck = lineas[i].nroMsg;
											if (++i >= lineas.length) stopProcess();
										}
										if (!SerialPortIsOpen) stopProcess();
									}, sinID ? 500 : 5);

								}
							},
							{},
							{
								view: "button",
								type: "icon",
								icon: "trash-o",
								label: "Limpiar",
								align: 'right',
								width: 100,
								click: function () {
									webix.confirm({
										type: "confirm-warning",
										text: "Se borrarán los datos del área de trabajo. ¿ Está seguro ?",
										callback: function (r) {
											if (r) $$('archivoText').setValue("");
										}
									});
								}
							},
							{
								id: 'idEquipo',
								view: "text",
								type: "icon",
								align: "center",
								placeholder: "ID Equipo",
								width: 100
							}]
						},
						{
							id: "archivoText",
							header: 'Consola',
							view: "codemirror-editor",
							defaults: {
								mode: "javascript",
								lineNumbers: true,
								matchBrackets: false,
								indentWithTabs: false,
								tabSize: 2,
								electricChars: false,
								theme: "default"
							},
							placeholder: "Comandos de Configuración",
							label: null,
							scroll: "xy",
							value: nvsConfigCmds
						}]
					}]
				}]
			}]
		}]
	});

	webix.attachEvent("unload", function (mode) {
		saveLocalStore();
	});

	$$("comandoText").attachEvent("onFocus", function () {
		var ct = $$("comandoText");
		ct.getInputNode().setSelectionRange(0, ct.getValue().length);
	});

	webix.extend($$("archivoText"), webix.ProgressBar);

	$$("comandoText").attachEvent("onKeyPress", function (code, e) {
		if (code == 13) {
			var ct = $$("comandoText");
			sendCommand(ct.getValue());
			setTimeout(function () {
				ct.getInputNode().setSelectionRange(0, ct.getValue().length);
			}, 100);
		} else if (code == 27) {
			sendEscape();
		}
	});

	setTimeout(function () {
		var editor = $$('archivoText').getEditor();
		editor.setOption('smartIndent', false);
		editor.setOption('indentWithTabs', false);
		editor.setOption('extraKeys', {
			"Ctrl-S": function () {saveFileDialog();}
		});
	}, 1000);
	renderLog();
});