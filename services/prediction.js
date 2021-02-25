// import * as tf from "@tensorflow/tfjs";
const tf = require("@tensorflow/tfjs");
const tfnode = require("@tensorflow/tfjs-node");
// import { loadGraphModel } from "@tensorflow/tfjs";

const model = null;
let prediction = [];

// async function loadGraphModel() {
// 	try {
// 		tf.model = await tf.models.modelFromJSON(
// 			"https://cakery-ai-s3.s3-ap-southeast-1.amazonaws.com/model.json"
// 		);
// 	} catch (error) {
// 		console.log(error);
// 	}

// 	// const pred = await tf.tidy(() => {
// 	// 	// const output = model.predict();
// 	// 	// console.log(output);
// 	// });
// }

async function loadModel() {
	const handler = tfnode.io.fileSystem("model/model.json");
	const model = await tf.loadLayersModel(handler);
	console.log("Model loaded");

	const pred = await tf.tidy(() => {
		x_test = [
			[
				[0.3125],
				[0.30803571],
				[0.3125],
				[0.31696429],
				[0.31696429],
				[0.32589286],
				[0.32589286],
				[0.33035714],
				[0.3125],
				[0.31696429],
				[0.31696429],
				[0.32589286],
				[0.33482143],
				[0.33482143],
				[0.33928571],
				[0.33482143],
				[0.33482143],
				[0.33928571],
				[0.33928571],
				[0.34821429],
				[0.34821429],
				[0.34821429],
				[0.34821429],
				[0.34375],
				[0.34375],
				[0.32589286],
				[0.31696429],
				[0.31696429],
				[0.30357143],
				[0.30357143],
				[0.29910714],
				[0.29464286],
				[0.29910714],
				[0.27678571],
				[0.25892857],
				[0.25446429],
				[0.37053571],
				[0.36160714],
				[0.37053571],
				[0.375],
				[0.37053571],
				[0.38392857],
				[0.40178571],
				[0.38839286],
				[0.38839286],
				[0.45982143],
				[0.46428571],
				[0.45089286],
				[0.45535714],
				[0.45982143],
				[0.53571429],
				[0.58482143],
				[0.50892857],
				[0.54017857],
				[0.64285714],
				[0.54017857],
				[0.51785714],
				[0.53125],
				[0.77232143],
				[0.77232143],
			],
		];
		// x_test = tf.tensor3d(x_test, [1, 1, 1]);
		// tf.reshape(x_test, [1, 1]);

		// tf.reshape(x_test, [x_test.length, 1, 1]);

		// x_test = tf.cast(x_test, "float32");
		console.log(x_test.length);
		const output = model.predict(tf.tensor(x_test, [x_test.length, 60, 1]));
		// console.log(output);

		// console.log(output);

		prediction = Array.from(output.dataSync());
		console.log(prediction);
	});
}

loadModel();
