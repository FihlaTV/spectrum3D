import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react'
import { GPU, GPUMode, GPUInternalMode } from "gpu.js"
import { FDTDSimulator, makeDrawSquareInfo, makeDrawCircleInfo, DrawShapeType } from "./simulator"
import { CollapsibleContainer, ControlComponent, SaveLoadComponent, SettingsComponent, ExamplesComponent } from './components'
import { toggleFullScreen, clamp, QualityPreset } from './util'
import Fullscreen from "./icons/fullscreen.png"
import "./App.css"
import { SignalSource } from './sources'
import * as k from './kernels/rendering'

function getGpuMode(): GPUMode | GPUInternalMode {
    if (GPU.isSinglePrecisionSupported) {
        if (GPU.isWebGL2Supported) {
            return "webgl2"
        } else if (GPU.isWebGLSupported) {
            return "webgl"
        }
    }

    return "cpu"
}

const qualityPresets: { [presetName: string]: QualityPreset } = {
    "Low": {
        dt: 0.013 * 2,
        cellSize: 0.02 * 2,
        resolutionScale: 0.3,
        gridSizeLongest: 400 / 2
    },
    "Medium": {
        dt: 0.013,
        cellSize: 0.02,
        resolutionScale: 1,
        gridSizeLongest: 400
    },
    "High": {
        dt: 0.013 / 2,
        cellSize: 0.02 / 2,
        resolutionScale: 1,
        gridSizeLongest: 400 * 2
    },
    "Ultra": {
        dt: 0.013 / 4,
        cellSize: 0.02 / 4,
        resolutionScale: 1,
        gridSizeLongest: 400 * 4
    }
}

const gpuMode = getGpuMode()
console.log(`Using GPU mode ${gpuMode}`)

const defaultPreset = gpuMode === "cpu" ? qualityPresets["Low"] : qualityPresets["Medium"]

const defaultSignalBrushValue = 10
const defaultSignalBrushSize = 1
const defaultSignalFrequency = gpuMode === "cpu" ? 1 : 3
const defaultPermittivityBrushValue = 5
const defaultPermeabilityBrushValue = 1
const defaultMaterialBrushSize = 5
const defaultDrawShapeType = "square"

const initialDt = defaultPreset.dt
const initialCellSize = defaultPreset.cellSize
const initialSimulationSpeed = 1
const initialGridSizeLongest = defaultPreset.gridSizeLongest
const initialResolutionScale = defaultPreset.resolutionScale
const initialWindowSize: [number, number] = [window.innerWidth, window.innerHeight]
const initialCanvasSize: [number, number] = calculateCanvasSize(initialWindowSize, initialResolutionScale)
const initialGridSize: [number, number] = calculateGridSize(initialGridSizeLongest, initialCanvasSize)
const initialReflectiveBoundary = false

function calculateCanvasSize(windowSize: [number, number], resolutionScale: number): [number, number] {
    return [Math.round(windowSize[0] * resolutionScale), Math.round(windowSize[1] * resolutionScale)]
}

function calculateGridSize(gridSizeLongest: number, canvasSize: [number, number]): [number, number] {
    const canvasAspect = canvasSize[0] / canvasSize[1]

    return canvasSize[0] >= canvasSize[1] ?
        [gridSizeLongest, Math.ceil(gridSizeLongest / canvasAspect)] :
        [Math.ceil(gridSizeLongest * canvasAspect), gridSizeLongest]
}

const makeRenderSimulatorCanvas = (gpu: GPU, canvasSize: [number, number]) => {
    const kernel = gpuMode !== "cpu" ? gpu.createKernel(k.drawGpu) : gpu.createKernel(k.drawCpu)
    return kernel.setOutput(canvasSize).setGraphical(true).setFunctions([k.getAt]).setWarnVarUsage(false).setTactic("performance").setPrecision("unsigned").setDynamicOutput(true).setDynamicArguments(true)
}

export default function () {
    const drawCanvasRef = useRef<HTMLCanvasElement>(null)

    const [canvasSize, setCanvasSize] = useState<[number, number]>(initialCanvasSize)
    const [windowSize, setWindowSize] = useState<[number, number]>(initialWindowSize)
    const [gridSizeLongest, setGridSizeLongest] = useState(initialGridSizeLongest)
    const [dt, setDt] = useState(initialDt)
    const [cellSize, setCellSize] = useState(initialCellSize)
    const [resolutionScale, setResolutionScale] = useState(initialResolutionScale)
    const [simulationSpeed, setSimulationSpeed] = useState(initialSimulationSpeed)
    const [reflectiveBoundary, setReflectiveBoundary] = useState(initialReflectiveBoundary)

    const [sources, setSources] = useState<SignalSource[]>([])

    useEffect(() => {
        const adjustCanvasSize = () => {
            const wndSize: [number, number] = [window.innerWidth, window.innerHeight]
            setCanvasSize(calculateCanvasSize(wndSize, resolutionScale))
            setWindowSize(wndSize)
        }

        adjustCanvasSize()

        window.addEventListener("resize", adjustCanvasSize)
        return () => window.removeEventListener("resize", adjustCanvasSize)
    }, [resolutionScale])

    const gridSize = useMemo<[number, number]>(() => calculateGridSize(gridSizeLongest, canvasSize), [canvasSize, gridSizeLongest])

    // Would use useMemo for gpu here, but useMemo does not seem to work with ref dependencies.
    const [gpu, setGpu] = useState<GPU | null>(null)
    useEffect(() => {
        if (drawCanvasRef.current) {
            setGpu(new GPU({ mode: gpuMode, canvas: drawCanvasRef.current }))
        }
    }, [drawCanvasRef])

    const simulator = useMemo(() => gpu ? new FDTDSimulator(gpu, initialGridSize, initialCellSize, initialReflectiveBoundary) : null, [gpu])
    const renderSim = useMemo(() => gpu ? makeRenderSimulatorCanvas(gpu, initialGridSize) : null, [gpu])

    // Update render sim output size
    useEffect(() => {
        if (renderSim) {
            renderSim.setOutput(canvasSize)
        }
    }, [renderSim, canvasSize])

    // Update simulator grid size
    useEffect(() => {
        if (simulator) {
            simulator.setGridSize(gridSize)
        }
    }, [simulator, gridSize])

    // Update simulator cell size
    useEffect(() => {
        if (simulator) {
            simulator.setCellSize(cellSize)
        }
    }, [simulator, cellSize])

    // Update reflective boundary
    useEffect(() => {
        if (simulator) {
            simulator.reflectiveBoundary = reflectiveBoundary
        }
    }, [simulator, reflectiveBoundary])

    const [signalBrushSize, setSignalBrushSize] = useState(defaultSignalBrushSize)
    const [signalBrushValue, setSignalBrushValue] = useState(defaultSignalBrushValue)
    const [drawShapeType, setDrawShapeType] = useState<DrawShapeType>(defaultDrawShapeType)

    const [materialBrushSize, setMaterialBrushSize] = useState(defaultMaterialBrushSize)
    const [permittivityBrushValue, setPermittivityBrushValue] = useState(defaultPermittivityBrushValue)
    const [permeabilityBrushValue, setPermeabilityBrushValue] = useState(defaultPermeabilityBrushValue)
    const [signalFrequency, setSignalFrequency] = useState(defaultSignalFrequency)
    const [drawingMaterial, setDrawingMaterial] = useState(false)
    const optionMaterialBrush = 0
    const optionSignal = 1
    const [clickOption, setClickOption] = useState(optionSignal) // material, signal

    const [mousePosition, setMousePosition] = useState<[number, number] | null>(null)

    const signalStrength = useRef(0)
    const mouseDownPos = useRef<[number, number] | null>(null)

    // Snap input across a line
    const [snapInput, setSnapInput] = useState(false)
    const [inputStartPos, setInputStartPos] = useState<[number, number] | null>(null)
    const [inputDir, setInputDir] = useState<[number, number] | null>(null)

    const windowToSimulationPoint = useMemo(() => {
        return (windowPoint: [number, number]) => {
            const simulationPoint: [number, number] = [
                clamp(0, gridSize[0] - 1, Math.floor(gridSize[0] * windowPoint[0] / windowSize[0])),
                clamp(0, gridSize[1] - 1, Math.floor(gridSize[1] * windowPoint[1] / windowSize[1]))
            ]
            return simulationPoint
        }
    }, [windowSize, gridSize])

    const simStep = useCallback(() => {
        if (simulator) {
            const simData = simulator.getData()

            if (mouseDownPos.current !== null) {
                const center = windowToSimulationPoint(mouseDownPos.current)
                const brushHalfSize = Math.round(signalBrushSize / 2)
                const value = -signalBrushValue * 2000 * Math.cos(2 * Math.PI * signalFrequency * simData.time)

                const drawInfo = drawShapeType === "square" ?
                    makeDrawSquareInfo(center, brushHalfSize, value) :
                    makeDrawCircleInfo(center, brushHalfSize, value)

                simulator.injectSignal(drawInfo, dt)
            }

            for (const source of sources) {
                source.inject(simulator, dt)
            }

            simulator.stepMagnetic(dt)
            simulator.stepElectric(dt)
        }
    }, [simulator, dt, signalFrequency, signalBrushValue, signalBrushSize, sources, windowToSimulationPoint, drawShapeType])

    useEffect(() => {
        if (simulationSpeed > 0) {
            const timer = setInterval(simStep, 1000 / simulationSpeed * dt)
            return () => clearInterval(timer)
        }

        return undefined
    }, [simStep, dt, simulationSpeed])

    const drawStep = useCallback(() => {
        if (simulator && renderSim) {
            if (drawCanvasRef.current) {
                const cnvSize = calculateCanvasSize([window.innerWidth, window.innerHeight], resolutionScale)
                drawCanvasRef.current.width = cnvSize[0]
                drawCanvasRef.current.height = cnvSize[1]
            }

            const simData = simulator.getData()

            renderSim(simData.electricField[0].values, simData.electricField[1].values, simData.electricField[2].values,
                simData.magneticField[0].values, simData.magneticField[1].values, simData.magneticField[2].values,
                simData.permittivity.values, simData.permeability.values, gridSize, cellSize)
        }
    }, [simulator, renderSim, gridSize, cellSize, resolutionScale, drawCanvasRef])

    useEffect(() => {
        let stop = false
        const drawIfNotStopped = () => {
            if (!stop) {
                drawStep()
                requestAnimationFrame(drawIfNotStopped)
            }
        }

        requestAnimationFrame(drawIfNotStopped)

        return () => { stop = true }
    }, [drawStep])

    const changeMaterial = useCallback((canvasPos: [number, number]) => {
        if (simulator) {
            const center: [number, number] = [
                Math.round(gridSize[0] * (canvasPos[0] / windowSize[0])),
                Math.round(gridSize[1] * (canvasPos[1] / windowSize[1]))
            ]
            const brushHalfSize = Math.round(materialBrushSize / 2)

            simulator.drawMaterial("permittivity", drawShapeType === "square" ?
                makeDrawSquareInfo(center, brushHalfSize, permittivityBrushValue) :
                makeDrawCircleInfo(center, brushHalfSize, permittivityBrushValue))

            simulator.drawMaterial("permeability", drawShapeType === "square" ?
                makeDrawSquareInfo(center, brushHalfSize, permeabilityBrushValue) :
                makeDrawCircleInfo(center, brushHalfSize, permeabilityBrushValue))
        }
    }, [simulator, gridSize, windowSize, materialBrushSize, permittivityBrushValue, permeabilityBrushValue, drawShapeType])

    const resetMaterials = useCallback(() => {
        if (simulator) {
            simulator.resetMaterials()
        }
    }, [simulator])

    const resetFields = useCallback(() => {
        if (simulator) {
            simulator.resetFields()
            signalStrength.current = 0
        }
    }, [simulator])

    const onInputDown = useCallback((clientPos: [number, number]) => {
        if (simulator) {
            setInputStartPos(clientPos)

            if (clickOption === optionSignal) {
                mouseDownPos.current = clientPos
            } else if (clickOption === optionMaterialBrush) {
                changeMaterial(clientPos)
                setDrawingMaterial(true)
            }
        }
    }, [simulator, changeMaterial, clickOption])

    const onInputMove = useCallback((clientPos: [number, number], shiftDown?: boolean) => {
        if (simulator) {
            let pos: [number, number] = clientPos

            // If snapping, change the position to lie along the draw line
            if ((snapInput || shiftDown) && inputStartPos) {
                const offset = [pos[0] - inputStartPos[0], pos[1] - inputStartPos[1]]
                if (inputDir) {
                    const projection = offset[0] * inputDir[0] + offset[1] * inputDir[1]
                    pos = [inputStartPos[0] + projection * inputDir[0], inputStartPos[1] + projection * inputDir[1]]
                } else {
                    const offsetLengthSq = offset[0] * offset[0] + offset[1] * offset[1]
                    const minimumSnapLengthSq = 0.01 * 0.01 * (windowSize[0] * windowSize[0] + windowSize[1] * windowSize[1])
                    if (offsetLengthSq > minimumSnapLengthSq) {
                        // Snap to discrete angles
                        const angleQuantum = Math.PI / 4
                        const snappedAngle = Math.round(Math.atan2(offset[1], offset[0]) / angleQuantum) * angleQuantum
                        const dir: [number, number] = [Math.cos(snappedAngle), Math.sin(snappedAngle)]
                        setInputDir(dir)
                    }
                }
            }

            if (clickOption === optionSignal && mouseDownPos.current !== null) {
                mouseDownPos.current = pos
            }

            if (drawingMaterial) {
                changeMaterial(pos)
            }
        }
    }, [simulator, changeMaterial, clickOption, drawingMaterial, inputDir, inputStartPos, windowSize, snapInput])

    const onInputUp = useCallback(() => {
        if (clickOption === optionSignal) {
            mouseDownPos.current = null
        } else if (clickOption === optionMaterialBrush) {
            setDrawingMaterial(false)
        }

        setInputDir(null)
        setInputStartPos(null)
    }, [clickOption])

    const activeBrushSize = useMemo(() => (clickOption === optionSignal ? signalBrushSize : materialBrushSize) * (canvasSize[0] / gridSize[0]), [clickOption, signalBrushSize, materialBrushSize, canvasSize, gridSize])

    return (
        <div style={{ touchAction: "none", userSelect: "none" }}>
            <canvas width={canvasSize[0]} height={canvasSize[1]} ref={drawCanvasRef} style={{ position: "absolute", width: windowSize[0], height: windowSize[1] }}
                onMouseDown={e => onInputDown([e.clientX, e.clientY])}
                onMouseMove={e => { setMousePosition([e.clientX, e.clientY]); onInputMove([e.clientX, e.clientY], e.shiftKey) }}
                onMouseUp={e => onInputUp()}
                onMouseLeave={e => onInputUp()}
                onTouchStart={e => { setMousePosition([e.touches[0].clientX, e.touches[0].clientY]); onInputDown([e.touches[0].clientX, e.touches[0].clientY]) }}
                onTouchMove={e => { setMousePosition([e.touches[0].clientX, e.touches[0].clientY]); onInputMove([e.touches[0].clientX, e.touches[0].clientY]) }}
                onTouchEnd={e => { setMousePosition(null); onInputUp() }}
                onTouchCancel={e => { setMousePosition(null); onInputUp() }}
                onContextMenu={e => e.preventDefault()}
            />

            <div style={{ position: "absolute", bottom: 10, right: 10 }}>
                <a href="mailto:tora@warlock.ai?subject=EM simulation feedback" rel="noopener noreferrer" target="_blank" style={{ fontWeight: "lighter", color: "rgba(255, 255, 255, 100)", textDecoration: "none", marginRight: "8px" }}>Feedback</a>
                <a href="https://github.com/RobinKa/maxwell-simulation" rel="noopener noreferrer" target="_blank" style={{ fontWeight: "lighter", color: "rgba(255, 255, 255, 100)", textDecoration: "none" }}>Source code</a>
            </div>

            {mousePosition && (drawShapeType === "square" ?
                <div style={{ position: "absolute", pointerEvents: "none", left: mousePosition[0] - activeBrushSize / 2, top: mousePosition[1] - activeBrushSize / 2, width: activeBrushSize, height: activeBrushSize, border: "2px solid yellow" }} /> :
                <div style={{ position: "absolute", pointerEvents: "none", left: mousePosition[0] - activeBrushSize / 2, top: mousePosition[1] - activeBrushSize / 2, width: activeBrushSize, height: activeBrushSize, border: "2px solid yellow", borderRadius: "50%" }} />)
            }

            {gpuMode === "cpu" &&
                <div style={{ position: "absolute", pointerEvents: "none", left: 10, bottom: 10, color: "red", fontWeight: "lighter" }}>Using CPU (WebGL with float textures unsupported by your device)</div>
            }

            <img onClick={toggleFullScreen} src={Fullscreen} alt="Fullscreen" style={{ position: "absolute", right: 10, top: 10, cursor: "pointer" }} />

            <CollapsibleContainer id="Menu" title="Menu" buttonStyle={{ background: "rgb(60, 60, 60)" }}>
                <CollapsibleContainer title="Examples">
                    <ExamplesComponent
                        simulator={simulator} setCellSize={setCellSize} setDt={setDt}
                        setGridSizeLongest={setGridSizeLongest} setSimulationSpeed={setSimulationSpeed}
                        setSources={setSources} gridSize={gridSize} dt={dt}
                        cellSize={cellSize} simulationSpeed={simulationSpeed} />
                </CollapsibleContainer>
                <CollapsibleContainer title="Controls">
                    <ControlComponent
                        signalBrushSize={signalBrushSize} setSignalBrushSize={setSignalBrushSize}
                        materialBrushSize={materialBrushSize} setMaterialBrushSize={setMaterialBrushSize}
                        signalBrushValue={signalBrushValue} setSignalBrushValue={setSignalBrushValue}
                        permittivityBrushValue={permittivityBrushValue} setPermittivityBrushValue={setPermittivityBrushValue}
                        permeabilityBrushValue={permeabilityBrushValue} setPermeabilityBrushValue={setPermeabilityBrushValue}
                        signalFrequency={signalFrequency} setSignalFrequency={setSignalFrequency}
                        clickOption={clickOption} setClickOption={setClickOption}
                        drawShapeType={drawShapeType} setDrawShapeType={setDrawShapeType}
                        snapInput={snapInput} setSnapInput={setSnapInput}
                        resetFields={resetFields} resetMaterials={resetMaterials} />
                </CollapsibleContainer>
                <CollapsibleContainer title="Save / Load" initiallyCollapsed={true}>
                    <SaveLoadComponent simulator={simulator} gridSize={gridSize} />
                </CollapsibleContainer>
                <CollapsibleContainer title="Settings" initiallyCollapsed={true}>
                    <SettingsComponent
                        gridSizeLongest={gridSizeLongest} setGridSizeLongest={setGridSizeLongest}
                        simulationSpeed={simulationSpeed} setSimulationSpeed={setSimulationSpeed}
                        resolutionScale={resolutionScale} setResolutionScale={setResolutionScale}
                        cellSize={cellSize} setCellSize={setCellSize}
                        reflectiveBoundary={reflectiveBoundary} setReflectiveBoundary={setReflectiveBoundary}
                        dt={dt} setDt={setDt}
                        qualityPresets={qualityPresets} />
                </CollapsibleContainer>
            </CollapsibleContainer>
        </div>
    )
}
