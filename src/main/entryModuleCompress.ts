import rollupCommonjs from '@rollup/plugin-commonjs';
import rollupResolve from '@rollup/plugin-node-resolve';
import path from 'path';
import { rollup } from 'rollup';
import { buildFilePath, unpackedBuildPath } from './constants';
import compressHardwareModuleFile from './core/hardware/compressHardwareModule';
import { BlockModuleReplacer, hardwareModuleReplacer } from './entryModuleReplacer';
import json from '@rollup/plugin-json';

import FileUtils from './utils/fileUtils';

async function rollupBlockFile(blockFilePath: string): Promise<void> {
    const blockFileName = path.basename(blockFilePath);
    if (!(await FileUtils.isExist(blockFilePath))) {
        throw new Error(`${blockFilePath} not exist`);
    }
    const bundle = await rollup({
        input: blockFilePath,
        inlineDynamicImports: true,
        plugins: [
            rollupResolve(),
            rollupCommonjs({
                include: 'node_modules/**',
            }),
            BlockModuleReplacer(),
            json(),
        ],
        external: ['lodash'],
    });
    await bundle.write({
        format: 'iife',
        file: path.join(unpackedBuildPath, blockFileName),
        globals: {
            lodash: '_',
        },
    });
}

async function rollupModuleFile(moduleFilePath: string): Promise<void> {
    const moduleFileName = path.basename(moduleFilePath);
    if (!(await FileUtils.isExist(moduleFilePath))) {
        throw new Error(`${moduleFilePath} not exist`);
    }
    const bundle = await rollup({
        input: moduleFilePath,
        plugins: [rollupResolve(), hardwareModuleReplacer(), json()],
    });
    await bundle.write({
        format: 'commonjs',
        file: moduleFilePath,
    });
}

async function writeMetadata(
    compressionInfo: EntryModuleCompressionInfo,
    hardwareInfo: HardwareConfig
): Promise<void> {
    const { moduleName, blockFilePath, version } = compressionInfo;
    const { platform, category, id } = hardwareInfo;
    const metadata: EntryModuleMetadata = {
        moduleName,
        version,
        type: 'hardware',
        title: hardwareInfo.name,
        files: {
            image: hardwareInfo.icon,
            block: path.basename(blockFilePath),
            module: `${moduleName}.zip`,
        },
        properties: { platform, category, id },
    };

    await FileUtils.writeJSONFile(path.join(unpackedBuildPath, 'metadata.json'), metadata);
}

async function copyImageFile(
    hardwareModulePath: string,
    hardwareInfo: HardwareConfig
): Promise<void> {
    const { icon } = hardwareInfo;
    await FileUtils.copyFile(
        path.join(hardwareModulePath, icon),
        path.join(unpackedBuildPath, icon)
    );
}

/**
 * 이전 하드웨어 모듈을 강제로 최신규약으로 수정하는 로직.
 * 아래의 일을 수행한다.
 * - moduleName, version 프로퍼티 주입
 * - icon, module 이 json 파일명과 다른 경우, 파일을 복사하고 강제로 icon, module 을 동일화
 *   (타사의 파일을 참조할 경우가 있을 수 있으므로 동일 코드여도 따로 관리하도록 규정)
 */
async function forceModifyHardwareModule(
    hardwareJSONPath: string,
    hardwareInfo: HardwareConfig,
    compressionInfo: EntryModuleCompressionInfo
): Promise<void> {
    const { moduleName, version } = compressionInfo;

    hardwareInfo.moduleName = moduleName;
    hardwareInfo.version = version;
    await FileUtils.writeJSONFile(hardwareJSONPath, hardwareInfo);
}

async function compressModule(moduleName: string): Promise<void> {
    const moduleFilePath = path.join(buildFilePath, `${moduleName}.zip`);
    const archiverInformation = {
        type: 'root',
        filePath: unpackedBuildPath,
    };

    await FileUtils.compress([archiverInformation], moduleFilePath);
}

export default async (compressionInfo: EntryModuleCompressionInfo) => {
    const { hardwareConfigPath, moduleName, blockFilePath } = compressionInfo;

    try {
        const hardwareModulePath = path.dirname(hardwareConfigPath);
        const hardwareInfo = await FileUtils.readJSONFile<HardwareConfig>(hardwareConfigPath);

        await FileUtils.clearDirectory(buildFilePath);
        await rollupBlockFile(blockFilePath);
        await copyImageFile(hardwareModulePath, hardwareInfo);

        await forceModifyHardwareModule(hardwareConfigPath, hardwareInfo, compressionInfo);
        // this replaces base_module
        await rollupModuleFile(
            path.join(compressionInfo.hardwareConfigPath, '..', `${moduleName}.js`)
        );

        await compressHardwareModuleFile(compressionInfo, hardwareInfo);

        await writeMetadata(compressionInfo, hardwareInfo);
        await compressModule(moduleName);
    } catch (e) {
        console.error(e);
        throw e;
    }
};
