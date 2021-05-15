// for getpredictionpro route function
function examineTrainedModelURL(details) {
	return new Promise((resolve, reject) => {
		try {
			const models = JSON.parse(details?.["preTrainedModelURL"]);

			if (models.length) {
				models.forEach((element) => {
					if (element["product"] == details["needPrediction"]) {
						details["trainedModelURL"] = element["trainedModelURL"];
					}
				});
			}
			resolve(details);
		} catch (error) {
			console.log("examineTrainedModelURL error : ", error);
			reject(error);
		}
	});
}

module.exports = {
	examineTrainedModelURL,
};
