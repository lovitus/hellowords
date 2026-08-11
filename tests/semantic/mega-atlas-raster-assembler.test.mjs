import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  MEGA_ATLAS_RASTER_CONTRACT,
  createMegaAtlasRasterContract,
  parseMegaAtlasRasterArguments,
  runMegaAtlasRasterAssembler,
} from "../../scripts/assemble-mega-atlas-raster.mjs";

const testContract = createMegaAtlasRasterContract(4, 2);

function fixturePixel(tileIndex, x, y) {
  return [
    10 + tileIndex * 30 + x,
    20 + tileIndex * 20 + y,
    30 + tileIndex * 10 + x + y,
    tileIndex === 5 ? 100 + x * 10 + y : 255,
  ];
}

async function writeFixture(path, tileIndex, { width = 4, channels = tileIndex === 5 ? 4 : 3 } = {}) {
  const pixels = Buffer.alloc(width * testContract.tileHeight * channels);
  for (let y = 0; y < testContract.tileHeight; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const expected = fixturePixel(tileIndex, x, y);
      const offset = (y * width + x) * channels;
      for (let channel = 0; channel < channels; channel += 1) {
        pixels[offset + channel] = expected[channel];
      }
    }
  }
  await sharp(pixels, {
    raw: { width, height: testContract.tileHeight, channels },
  }).png().toFile(path);
}

async function createFixtures(root) {
  const paths = Array.from({ length: testContract.tileCount }, (_, index) => (
    join(root, `tile-${index + 1}.png`)
  ));
  await Promise.all(paths.map((path, index) => writeFixture(path, index)));
  return paths;
}

async function createDetailedFixtures(root, contract) {
  const paths = Array.from({ length: contract.tileCount }, (_, index) => (
    join(root, `detailed-tile-${index + 1}.png`)
  ));
  await Promise.all(paths.map(async (path, tileIndex) => {
    const pixels = Buffer.alloc(contract.tileWidth * contract.tileHeight * 3);
    for (let y = 0; y < contract.tileHeight; y += 1) {
      for (let x = 0; x < contract.tileWidth; x += 1) {
        const hash = (
          Math.imul(x + 1, 73_856_093)
          ^ Math.imul(y + 1, 19_349_663)
          ^ Math.imul(tileIndex + 1, 83_492_791)
        ) >>> 0;
        const offset = (y * contract.tileWidth + x) * 3;
        pixels[offset] = hash & 255;
        pixels[offset + 1] = (hash >>> 8) & 255;
        pixels[offset + 2] = (hash >>> 16) & 255;
      }
    }
    await sharp(pixels, {
      raw: { width: contract.tileWidth, height: contract.tileHeight, channels: 3 },
    }).png().toFile(path);
  }));
  return paths;
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("production mega-atlas raster dimensions are exactly 3 columns by 2 rows", () => {
  assert.deepEqual(MEGA_ATLAS_RASTER_CONTRACT, {
    columns: 3,
    rows: 2,
    tileCount: 6,
    tileWidth: 1_672,
    tileHeight: 941,
    gutter: 96,
    highWidth: 5_208,
    highHeight: 1_978,
    baseWidth: 2_604,
    baseHeight: 989,
  });
});

test("96 px stone gutters preserve panel origins with deterministic joints and shadows", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "hellowords-mega-atlas-gutter-"));
  const gutterContract = createMegaAtlasRasterContract(4, 2, 96);
  try {
    const inputs = await createFixtures(temporaryRoot);
    const pngHigh = join(temporaryRoot, "audit-high.png");
    const pngBase = join(temporaryRoot, "audit-base.png");
    const secondPngHigh = join(temporaryRoot, "second-high.png");
    const secondPngBase = join(temporaryRoot, "second-base.png");
    const audit = await runMegaAtlasRasterAssembler({
      inputPaths: inputs,
      highOutput: pngHigh,
      baseOutput: pngBase,
      contract: gutterContract,
    });
    const secondAudit = await runMegaAtlasRasterAssembler({
      inputPaths: inputs,
      highOutput: secondPngHigh,
      baseOutput: secondPngBase,
      contract: gutterContract,
    });

    assert.deepEqual(
      audit.inputs.map(({ x, y }) => [x, y]),
      [[0, 0], [100, 0], [200, 0], [0, 98], [100, 98], [200, 98]],
    );
    const decoded = await sharp(await readFile(pngHigh)).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual(
      { width: decoded.info.width, height: decoded.info.height, channels: decoded.info.channels },
      { width: 204, height: 100, channels: 4 },
    );
    for (const [tileIndex, input] of audit.inputs.entries()) {
      for (let y = 0; y < gutterContract.tileHeight; y += 1) {
        for (let x = 0; x < gutterContract.tileWidth; x += 1) {
          const offset = (
            (input.y + y) * gutterContract.highWidth + input.x + x
          ) * decoded.info.channels;
          assert.deepEqual(
            [...decoded.data.subarray(offset, offset + 4)],
            fixturePixel(tileIndex, x, y),
            `gutter layout changed panel ${tileIndex + 1} pixel (${x}, ${y})`,
          );
        }
      }
    }

    const averageRed = (x) => {
      let total = 0;
      for (let y = 0; y < gutterContract.highHeight; y += 1) {
        total += decoded.data[(y * gutterContract.highWidth + x) * decoded.info.channels];
      }
      return total / gutterContract.highHeight;
    };
    assert.ok(averageRed(52) + 8 < averageRed(44), "the 48 px stone joint remains visible");
    assert.ok(averageRed(8) + 3 < averageRed(28), "the panel-edge shadow remains visible");
    assert.equal(audit.high.sha256, secondAudit.high.sha256);
    assert.equal(audit.base.sha256, secondAudit.base.sha256);
    assert.deepEqual(await readFile(pngHigh), await readFile(secondPngHigh));
    assert.deepEqual(await readFile(pngBase), await readFile(secondPngBase));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("progressive 4:4:4 JPEG is deterministic, direct-downsampled and smaller than PNG", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "hellowords-mega-atlas-jpeg-"));
  const detailedContract = createMegaAtlasRasterContract(64, 36);
  try {
    const inputs = await createDetailedFixtures(temporaryRoot, detailedContract);
    const audit = await runMegaAtlasRasterAssembler({
      inputPaths: inputs,
      highOutput: join(temporaryRoot, "audit-high.png"),
      baseOutput: join(temporaryRoot, "audit-base.png"),
      contract: detailedContract,
    });
    const first = await runMegaAtlasRasterAssembler({
      inputPaths: inputs,
      highOutput: join(temporaryRoot, "first-high.jpg"),
      baseOutput: join(temporaryRoot, "first-base.jpeg"),
      contract: detailedContract,
    });
    const second = await runMegaAtlasRasterAssembler({
      inputPaths: inputs,
      highOutput: join(temporaryRoot, "second-high.jpeg"),
      baseOutput: join(temporaryRoot, "second-base.jpg"),
      contract: detailedContract,
    });
    const mixed = await runMegaAtlasRasterAssembler({
      inputPaths: inputs,
      highOutput: join(temporaryRoot, "mixed-high.png"),
      baseOutput: join(temporaryRoot, "mixed-base.jpg"),
      contract: detailedContract,
    });

    assert.deepEqual(
      [first.high.format, first.high.width, first.high.height, first.high.channels],
      ["jpeg", 192, 72, 3],
    );
    assert.deepEqual(
      [first.base.format, first.base.width, first.base.height, first.base.channels],
      ["jpeg", 96, 36, 3],
    );
    assert.equal(first.high.sha256, second.high.sha256);
    assert.equal(first.base.sha256, second.base.sha256);
    assert.equal(
      first.base.sha256,
      mixed.base.sha256,
      "base JPEG must not depend on whether high was encoded as PNG or JPEG",
    );
    const highMetadata = await sharp(first.high.path).metadata();
    const baseMetadata = await sharp(first.base.path).metadata();
    assert.equal(highMetadata.isProgressive, true, "high JPEG remains progressive");
    assert.equal(baseMetadata.isProgressive, true, "base JPEG remains progressive");
    assert.equal(highMetadata.chromaSubsampling, "4:4:4");
    assert.equal(baseMetadata.chromaSubsampling, "4:4:4");
    assert.ok(
      first.high.bytes < audit.high.bytes * 0.65,
      `expected JPEG (${first.high.bytes}) to be significantly smaller than PNG (${audit.high.bytes})`,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("raster assembler preserves six-tile order, pixel boundaries, alpha and output hashes", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "hellowords-mega-atlas-raster-"));
  try {
    const inputs = await createFixtures(temporaryRoot);
    const firstHigh = join(temporaryRoot, "first-high.png");
    const firstBase = join(temporaryRoot, "first-base.png");
    const secondHigh = join(temporaryRoot, "second-high.png");
    const secondBase = join(temporaryRoot, "second-base.png");
    const first = await runMegaAtlasRasterAssembler({
      inputPaths: inputs,
      highOutput: firstHigh,
      baseOutput: firstBase,
      contract: testContract,
    });
    const second = await runMegaAtlasRasterAssembler({
      inputPaths: inputs,
      highOutput: secondHigh,
      baseOutput: secondBase,
      contract: testContract,
    });

    assert.deepEqual(
      first.inputs.map(({ row, column }) => [row, column]),
      [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]],
    );
    const highBytes = await readFile(firstHigh);
    const baseBytes = await readFile(firstBase);
    const decoded = await sharp(highBytes).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual(
      { width: decoded.info.width, height: decoded.info.height, channels: decoded.info.channels },
      { width: 12, height: 4, channels: 4 },
    );
    for (let y = 0; y < testContract.highHeight; y += 1) {
      for (let x = 0; x < testContract.highWidth; x += 1) {
        const tileColumn = Math.floor(x / testContract.tileWidth);
        const tileRow = Math.floor(y / testContract.tileHeight);
        const tileIndex = tileRow * testContract.columns + tileColumn;
        const localX = x % testContract.tileWidth;
        const localY = y % testContract.tileHeight;
        const offset = (y * testContract.highWidth + x) * 4;
        assert.deepEqual(
          [...decoded.data.subarray(offset, offset + 4)],
          fixturePixel(tileIndex, localX, localY),
          `pixel (${x}, ${y}) must remain in tile ${tileIndex + 1}`,
        );
      }
    }

    assert.equal(first.high.bytes, highBytes.byteLength);
    assert.equal(first.high.sha256, digest(highBytes));
    assert.equal(first.base.bytes, baseBytes.byteLength);
    assert.equal(first.base.sha256, digest(baseBytes));
    assert.equal(first.high.sha256, second.high.sha256);
    assert.equal(first.base.sha256, second.base.sha256);
    assert.deepEqual(highBytes, await readFile(secondHigh));
    assert.deepEqual(baseBytes, await readFile(secondBase));
    const baseMetadata = await sharp(baseBytes).metadata();
    assert.equal(baseMetadata.format, "png");
    assert.equal(baseMetadata.width, 6);
    assert.equal(baseMetadata.height, 2);
    assert.equal(baseMetadata.channels, 4);
    await assert.rejects(
      runMegaAtlasRasterAssembler({
        inputPaths: inputs,
        highOutput: firstHigh,
        baseOutput: firstBase,
        contract: testContract,
      }),
      /Refusing to overwrite existing output/,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("raster assembler rejects count, dimensions, pixel format and unsafe output paths", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "hellowords-mega-atlas-errors-"));
  try {
    const inputs = await createFixtures(temporaryRoot);
    const output = {
      highOutput: join(temporaryRoot, "high.png"),
      baseOutput: join(temporaryRoot, "base.png"),
      contract: testContract,
    };
    await assert.rejects(
      runMegaAtlasRasterAssembler({ ...output, inputPaths: inputs.slice(0, 5) }),
      /Expected exactly 6 input tiles; received 5/,
    );

    const wrongSize = join(temporaryRoot, "wrong-size.png");
    await writeFixture(wrongSize, 2, { width: 6, channels: 3 });
    await assert.rejects(
      runMegaAtlasRasterAssembler({
        ...output,
        inputPaths: inputs.with(2, wrongSize),
      }),
      /expected exactly 4 x 2; received 6 x 2/,
    );

    const sixteenBit = join(temporaryRoot, "sixteen-bit.png");
    await sharp({
      create: {
        width: testContract.tileWidth,
        height: testContract.tileHeight,
        channels: 3,
        background: { r: 20, g: 40, b: 60 },
      },
    }).toColourspace("rgb16").png({ bitdepth: 16 }).toFile(sixteenBit);
    await assert.rejects(
      runMegaAtlasRasterAssembler({
        ...output,
        inputPaths: inputs.with(2, sixteenBit),
      }),
      /expected 8-bit pixels/,
    );

    await assert.rejects(
      runMegaAtlasRasterAssembler({
        ...output,
        inputPaths: inputs,
        highOutput: inputs[0],
      }),
      /output path must not overwrite an input tile/,
    );
    await assert.rejects(
      runMegaAtlasRasterAssembler({
        ...output,
        inputPaths: inputs,
        highOutput: join(temporaryRoot, "high.webp"),
      }),
      /must use a \.png, \.jpg or \.jpeg extension/,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("CLI parser fixes positional order and requires explicit output paths", () => {
  const inputs = ["one.png", "two.png", "three.png", "four.png", "five.png", "six.png"];
  assert.deepEqual(
    parseMegaAtlasRasterArguments([
      ...inputs,
      "--high",
      "high.png",
      "--base=base.png",
      "--force",
    ]),
    {
      help: false,
      inputPaths: inputs,
      highOutput: "high.png",
      baseOutput: "base.png",
      force: true,
    },
  );
  assert.throws(
    () => parseMegaAtlasRasterArguments([...inputs.slice(0, 5), "--high", "h.png", "--base", "b.png"]),
    /Expected exactly 6 input tiles; received 5/,
  );
  assert.throws(() => parseMegaAtlasRasterArguments(inputs), /--high is required/);
});
