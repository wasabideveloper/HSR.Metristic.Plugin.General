'use strict';

let Path = require('path');
let FS = require('fs');
let countLinesInFile = require('count-lines-in-file');

import {Check} from "metristic-core";
import {Report} from "metristic-core";
import {HtmlReport} from "metristic-core";
import {Barrier} from "metristic-core";


export interface FileInfo {
	name: string,
	size: number,
	changed: Date,
	numberOfLines: number
}

export interface DirectoryInfo {
	name: string,
	files: FileInfo[],
	directories: DirectoryInfo[]
}


export class StructureMetric implements Check {
	static assetsDirectory: string = Path.join(__dirname, './assets');
	static styleSheetFiles: string[] = ['/styles/styles.css'];

	private reportTemplate: string;
	private partials: {[name:string]:string};
	private errors: Error[] = [];

	constructor(private options: { [name: string]: any }) {
		this.reportTemplate = FS.readFileSync(Path.join(__dirname, './templates/reportTemplate.html'), "utf8");
		this.partials = {
			directoryPartial: FS.readFileSync(Path.join(__dirname, './templates/directoryPartial.html'), "utf8")
		};
	}


	public execute(directory: string, callback: (report: Report, errors?:Error[]) => void): void {
		let statistics: any = {
			structure: {},
			counts: {
				numberOfDirectories: 0,
				numberOfFiles: 0,
				numberOfLines: 0
			}
		};
		let awaiter: Barrier = new Barrier(1).then(() => {
			let report: Report = new HtmlReport('File structure', this.reportTemplate, this.partials, statistics);
			callback(report, this.errors);
		});
		StructureMetric.walkStructure(awaiter, directory, statistics.structure, statistics.counts, this.errors);
	};

	protected static walkStructure(awaiter: Barrier, path: string, structure, counts: any, errors: Error[]): void {
		structure['name'] = Path.basename(path);
		structure['directories'] = [];
		structure['files'] = [];

		FS.readdir(path, (error: Error, files: string[]) => {
			if (error) {
				errors.push(error);
			} else {
				awaiter.expand(files.length);
				files.forEach((file) => {
					let subPath = Path.join(path, file);
					let fileStats = FS.statSync(subPath);
					if (fileStats.isDirectory()) {
						counts.numberOfDirectories++;
						let subDirectory = {};
						structure[ 'directories' ].push(subDirectory);
						StructureMetric.walkStructure(awaiter, subPath, subDirectory, counts, errors);
					} else {
						counts.numberOfFiles++;
						StructureMetric.getFileInfo(subPath, fileStats, errors, (fileInfo: FileInfo) => {
							counts.numberOfLines += (fileInfo.numberOfLines || 0);
							structure[ 'files' ].push(fileInfo);
							awaiter.finishedTask(subPath);
						});
					}
				});
			}
			awaiter.finishedTask(path);
		});
	}

	protected static getFileInfo(filePath: string, fileStats: any, errors: Error[], callback: (fileInfo: FileInfo) => void): void {
		let fileInfo: FileInfo = {
			name: Path.basename(filePath),
			size: fileStats[ 'size' ] / 1024, // KiB
			changed: new Date(fileStats[ 'mtime' ]),
			numberOfLines: null
		};

		countLinesInFile(filePath, (error: Error, numberOfLines: number) => {
			if (error) {
				errors.push(error);
			} else {
				fileInfo.numberOfLines = Number(numberOfLines);
			}
			callback(fileInfo);
		});
	}
}
