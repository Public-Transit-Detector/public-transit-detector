import { parse } from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { OsmExtractor } from "./osmExtractor";
import { OsmPlatformTransformer } from "./osmPlatformTransformer";

async function run(): Promise<void> {
    const argv = await yargs(hideBin(process.argv))
        .options({
            inFile: { type: "string", demandOption: true, alias: "i" },
            outDir: { type: "string", demandOption: false, alias: "o" },
            uncompressedOutFile: { type: "boolean", demandOption: false, alias: "u" }
        })
        .parse();
    console.log("Extracting OSM data");
    const extractor = OsmExtractor.forPlatforms(argv.inFile);
    const extraction = await extractor.extract();

    console.log("Done extracting, transforming");
    const transformer = new OsmPlatformTransformer(extraction);
    if (argv.uncompressedOutFile) {
        await transformer.writeToDir(argv.outDir ?? parse(argv.inFile).dir);
    } else {
        await transformer.writeCompressedToDir(argv.outDir ?? parse(argv.inFile).dir);
    }

    console.log("Done");
}

run().catch(console.error);
