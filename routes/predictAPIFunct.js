const http = require("http");
const https = require("https");
const csv = require("csvtojson");
const url = require("url");

function getSalesReport(fileURL) {
	return new Promise((resolve, reject) => {
		// "https://cakery-ai-s3.s3-ap-southeast-1.amazonaws.com/CakeMonthlySaleReport.csv"
		https
			.get(fileURL, (resp) => {
				let data = "";
				resp.on("data", (chunk) => {
					data += chunk;
				});

				resp.on("end", async () => {
					// console.log(csvArr);
					// return "data";
					try {
						const csvData = [];
						await csv()
							.fromString(data)
							.subscribe(function (jsonObj) {
								csvData.push(jsonObj);
							});
						console.log(csvData);
						resolve(csvData);
					} catch (e) {
						reject(e);
					}
				});
			})
			.on("error", (err) => {
				console.log("GET Error: " + err);
				reject(err);
				// res.status(500).json({ message: "internel server error : aws" });
			});
	});
}

function getPredictionBySalesreport(details) {
	return new Promise((resolve, reject) => {
		const requestUrl = url.parse(
			url.format({
				protocol: "http",
				hostname: "localhost",
				port: 8000,
				pathname: "/app/getPredictionEduraca",
				query: details,
			})
		);
		console.log(url.format(requestUrl));
		http
			.get(url.format(requestUrl), (resp) => {
				let data = "";

				resp.on("data", (chunk) => {
					// console.log("GET chunk : " + chunk);
					data += chunk;
				});

				resp.on("end", () => {
					try {
						// res.status(200).json(JSON.parse(data));
						resolve(JSON.parse(data));
					} catch (e) {
						// internel server errorss 1
						reject(e);
					}
				});
			})
			.on("error", (err) => {
				// console.log("GET Error 1: " + err);
				console.log("api error xxxxxxxx");
				reject(err);
			});
	});
}

// pro users
function pro_trainModel(details) {
	return new Promise((resolve, reject) => {
		const requestUrl = url.parse(
			url.format({
				protocol: "http",
				hostname: "localhost",
				port: 8000,
				pathname: "/app/trainPredict",
				query: details,
			})
		);
		console.log(url.format(requestUrl));
		http
			.get(url.format(requestUrl), (resp) => {
				let data = "";

				resp.on("data", (chunk) => {
					data += chunk;
				});

				resp.on("end", () => {
					try {
						// res.status(200).json(JSON.parse(data));
						resolve(JSON.parse(data));
					} catch (e) {
						// internel server errorss 1
						reject(e);
					}
				});
			})
			.on("error", (err) => {
				// console.log("GET Error 1: " + err);
				console.log("api error xxxxxxxx");
				reject(err);
			});
	});
}
module.exports = { getSalesReport, getPredictionBySalesreport, pro_trainModel };
