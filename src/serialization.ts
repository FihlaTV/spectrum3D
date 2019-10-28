import * as pako from "pako"

export type SimulationSettings = {
    dt: number
    gridSize: [number, number]
    simulationSpeed: number
    cellSize: number
}

export type MaterialMap = {
    permittivity: number[][]
    permeability: number[][]
    shape: [number, number]
}

export type EncodedMaterialMap = string

export type SourceDescriptor = {
    type: "point"
    position: [number, number]
    amplitude: number
    frequency: number
    turnOffTime?: number
}

export type SimulatorMap = {
    materialMap: MaterialMap
    simulationSettings: SimulationSettings
    sourceDescriptors: SourceDescriptor[]
}

export type EncodedSimulatorMap = {
    encodedMaterialMap: string
    simulationSettings: SimulationSettings
    sourceDescriptors: SourceDescriptor[]
}

export function encodeSimulatorMap(simulatorMap: SimulatorMap): EncodedSimulatorMap {
    return {
        simulationSettings: simulatorMap.simulationSettings,
        sourceDescriptors: simulatorMap.sourceDescriptors,
        encodedMaterialMap: encodeMaterialMap(simulatorMap.materialMap)
    }
}

export function decodeSimulatorMap(encodedSimulatorMap: EncodedSimulatorMap): SimulatorMap {
    const materialMap = decodeMaterialMap(encodedSimulatorMap.encodedMaterialMap)

    return {
        simulationSettings: encodedSimulatorMap.simulationSettings,
        sourceDescriptors: encodedSimulatorMap.sourceDescriptors,
        materialMap: materialMap
    }
}

export function encodeMaterialMap(materialMap: MaterialMap): string {
    const materialMapArray = new Float32Array(2 + 2 * materialMap.shape[0] * materialMap.shape[1])

    materialMapArray[0] = materialMap.shape[0]
    materialMapArray[1] = materialMap.shape[1]

    for (let y = 0; y < materialMap.shape[1]; y++) {
        for (let x = 0; x < materialMap.shape[0]; x++) {
            const index = y * materialMap.shape[0] * 2 + x * 2
            materialMapArray[2 + index] = materialMap.permittivity[y][x]
            materialMapArray[2 + index + 1] = materialMap.permeability[y][x]
        }
    }

    const encodedMaterialMap: EncodedMaterialMap = pako.deflate(new Uint8Array(materialMapArray.buffer), { to: "string" })
    return encodedMaterialMap
}

export function decodeMaterialMap(encodedMaterialMap: EncodedMaterialMap): MaterialMap {
    const materialMapArray = new Float32Array(pako.inflate(encodedMaterialMap).buffer)
    const shape: [number, number] = [materialMapArray[0], materialMapArray[1]]

    const permittivity: number[][] = []
    const permeability: number[][] = []

    for (let y = 0; y < shape[1]; y++) {
        permittivity.push([])
        permeability.push([])
        for (let x = 0; x < shape[0]; x++) {
            const index = y * shape[0] * 2 + x * 2
            permittivity[y].push(materialMapArray[2 + index])
            permeability[y].push(materialMapArray[2 + index + 1])
        }
    }

    return {
        shape: shape,
        permittivity: permittivity,
        permeability: permeability
    }
}