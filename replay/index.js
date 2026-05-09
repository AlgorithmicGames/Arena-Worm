'use strict'
function _a() {
	function rotateArray(array) {
		const result = []
		for (let i = array[0].length - 1; 0 <= i; i--) {
			const row = array.map((e) => e[i])
			result.push(row)
		}
		return result
	}
	ReplayHelper.init((replay) => {
		let playStarted = null
		const controller = document.getElementById('controller')
		const slider = document.getElementById('slider')
		const slider_rotateX = document.getElementById('slider-rotateX')
		const slider_rotateZ = document.getElementById('slider-rotateZ')
		const buttonBack = document.getElementById('step-back')
		const buttonNext = document.getElementById('step-next')
		const gameboard = document.getElementById('gameboard')
		const layerWrapper = document.getElementById('layer-wrapper')
		const scoreBoard = document.getElementById('score-board')
		const selectMatches = document.getElementById('matches')
		const play = document.getElementById('play')
		const matchCompleted = []
		let activeMatchLog = null
		let ticksCache = []
		let tickPollTimer = null
		let threeDDocumentListenersAttached = false
		let dragPos = null
		const bestOfRaw = replay.arenaResult.settings?.general?.bestOf
		const bestOfCount = Number.isFinite(Number(bestOfRaw)) && Number(bestOfRaw) >= 1 ? Math.floor(Number(bestOfRaw)) : 1

		function rebuildScoreboard() {
			let scoreBoardString = ''
			const matchLogErrors = replay.arenaResult.match.filter((l) => l.error)
			if (matchLogErrors.length) {
				scoreBoard.parentElement.parentElement.style.display = ''
				scoreBoardString = '<b style="color: red">Aborted</b><br>'
				matchLogErrors.forEach((matchLogError) =>
					scoreBoardString += '<div style="color: white">Match ' + (replay.arenaResult.match.findIndex((l) => l === matchLogError) + 1) + ': ' +
						(matchLogError.participantName ? matchLogError.participantName + ': ' : '') + matchLogError.error + '</div>'
				)
			}
			scoreBoardString += '<div style="text-align: center; font-style: italic;">' + (replay.arenaResult.result.partialResult ? 'Partial result' : 'Result') +
				'</div><table><tr><th>Team</th><th>Participant</th>'
			const dataRows = []
			replay.arenaResult.match.forEach((matchLog, index) => {
				if (matchLog.scores) {
					scoreBoardString += '<th>' + (1 < replay.arenaResult.match.length ? 'Match ' + (index + 1) : 'Score') + '</th>'
					matchLog.scores.forEach((score) => {
						if (!dataRows[score.team]) {
							dataRows[score.team] = [
								'<tr style="color:' + replay.arenaResult.teams[score.team].color.RGB + ';"><td>' + score.team + '</td><td>' +
								score.members[0].name + '</td>',
								score.score,
							]
						}
						dataRows[score.team][0] += '<td>' + score.score + '</td>'
					})
				}
			})
			if (1 < replay.arenaResult.match.length) {
				scoreBoardString += '<th>Total</th><th>Average</th>'
				replay.arenaResult.result.team.forEach((r, i) => {
					let average = Math.round(r.average.score * 10) / 10
					if (average % 1 === 0) {
						average = '' + average + '.0'
					}
					dataRows[i][0] += '<td>' + r.total.score + '</td><td data-average="' + r.average.score + '">' + average + '</td></tr>'
				})
			}
			scoreBoardString += dataRows.sort((s1, s2) => s2[1] - s1[1]).map((s) => s[0]).join('') + '</table>'
			scoreBoard.innerHTML = scoreBoardString
		}

		void replay.onAbort.then(() => rebuildScoreboard())

		let promiseQueue = Promise.resolve()
		function pullGameplayTicks() {
			return promiseQueue = promiseQueue.then(async () => {
				if (!activeMatchLog) return
				const total = await activeMatchLog.log.count()
				while (ticksCache.length < total) {
					const entry = await activeMatchLog.log.get(ticksCache.length)
					if (entry && entry.type === 'tick') {
						ticksCache.push(entry)
					}
				}
				const maxTickIndex = ticksCache.length === 0 ? 0 : ticksCache.length - 1
				slider.max = maxTickIndex
				if (slider.valueAsNumber > maxTickIndex) {
					slider.valueAsNumber = maxTickIndex
				}
			})
		}

		function angleChange() {
			layerWrapper.style.transform = 'rotateX(' + slider_rotateX.value + 'deg) rotateZ(' + -slider_rotateZ.value + 'deg)'
		}
		function updateDragPos(mouseEvent) {
			if (![slider, slider_rotateX, slider_rotateZ].includes(mouseEvent.srcElement)) {
				dragPos = { x: mouseEvent.pageX, y: mouseEvent.pageY }
			}
		}

		function getCurrentMatchIndex() {
			return replay.arenaResult.match.findIndex((match) => match === activeMatchLog)
		}

		globalThis.onresize = () => {
			if (gameboard.offsetWidth === 0) {
				setTimeout(globalThis.onresize, 100)
				return
			}
			gameboard.parentElement.style.margin = ''
			gameboard.style.zoom = 1
			const bodyMargin = parseFloat(globalThis.getComputedStyle(document.body, null).getPropertyValue('margin-top')) +
				parseFloat(globalThis.getComputedStyle(document.body, null).getPropertyValue('margin-bottom'))
			const wrapperHeight = globalThis.innerHeight - parseFloat(globalThis.getComputedStyle(controller, null).getPropertyValue('height')) - bodyMargin
			const wrapperSize = gameboard.parentElement.offsetWidth < wrapperHeight ? gameboard.parentElement.offsetWidth : wrapperHeight
			const zoom = wrapperSize / gameboard.offsetWidth
			gameboard.style.zoom = zoom * (replay.arenaResult.settings.arena.threeDimensions ? .5 : .9)
			gameboard.parentElement.style.margin = 'auto'
		}
		if (bestOfCount <= 1) {
			selectMatches.style.display = 'none'
		}

		slider.oninput = () => {
			playToggled(undefined, true)
			setTick(slider.valueAsNumber)
		}

		selectMatches.onchange = () => {
			slider.valueAsNumber = 0
			setTick(0)
			if (tickPollTimer !== null) {
				clearInterval(tickPollTimer)
				tickPollTimer = null
			}
			const currentMatchIndex = parseInt(selectMatches.selectedOptions[0].dataset.index)
			activeMatchLog = replay.arenaResult.match[currentMatchIndex]
			scoreBoard.parentElement.parentElement.style.display = 'none'
			ticksCache = []

			if (replay.arenaResult.settings.arena.threeDimensions) {
				if (!threeDDocumentListenersAttached) {
					threeDDocumentListenersAttached = true
					document.addEventListener('mousedown', updateDragPos)
					document.addEventListener('mouseup', () => dragPos = null)
					document.addEventListener('mousemove', (mouseEvent) => {
						if (dragPos) {
							const deltaX = dragPos.x - mouseEvent.pageX
							const deltaY = dragPos.y - mouseEvent.pageY
							updateDragPos(mouseEvent)
							slider_rotateX.valueAsNumber += deltaY
							slider_rotateZ.valueAsNumber -= deltaX
							switch (slider_rotateZ.value) {
								case slider_rotateZ.max:
									slider_rotateZ.value = slider_rotateZ.min
									break
								case slider_rotateZ.min:
									slider_rotateZ.value = slider_rotateZ.max
									break
							}
							angleChange()
						}
					})
				}
				slider_rotateX.oninput = angleChange
				slider_rotateZ.oninput = angleChange
				angleChange()
				slider_rotateX.style.display = 'unset'
				slider_rotateZ.style.display = 'unset'
				gameboard.classList.add('threeDimensions')
			}

			void pullGameplayTicks().then(() => {
				slider.valueAsNumber = 0
				setTick(0)
				startPlayback()
			})

			void activeMatchLog.log.awaitCompletion().then(async () => {
				matchCompleted[getCurrentMatchIndex()] = true
				await pullGameplayTicks()
				rebuildScoreboard()
			})

			function repeat() {
				pullGameplayTicks().then(() => {
					if (matchCompleted[getCurrentMatchIndex()]) {
						return
					}
					repeat()
				})
			}
			repeat()
		}

		function startPlayback() {
			play.value = '❚❚'
			playStarted = Date.now()
			globalThis.onresize()
		}

		function playToggled(_mouseEvent, stop = false) {
			if (stop || play.value !== '▶') {
				play.value = '▶'
				playStarted = null
			} else {
				if (buttonNext.disabled) {
					slider.valueAsNumber = -1
				}
				startPlayback()
			}
			globalThis.onresize()
		}
		function setTick(logIndex = -1) {
			const ticks = ticksCache
			const isFinished = slider.valueAsNumber === ticks.length - 1 || ticks.length === 0
			buttonBack.disabled = slider.valueAsNumber === 0
			buttonNext.disabled = isFinished
			scoreBoard.parentElement.parentElement.style.display = matchCompleted[getCurrentMatchIndex()] && isFinished ? '' : 'none'
			if (isFinished && play.value !== '▶' && matchCompleted[getCurrentMatchIndex()]) {
				playToggled(undefined, true)
			}
			const tick = 0 <= logIndex && logIndex < ticks.length ? JSON.parse(JSON.stringify(ticks[logIndex])) : null
			while (layerWrapper.firstChild) {
				layerWrapper.removeChild(layerWrapper.lastChild)
			}
			if (tick) {
				if (replay.arenaResult.settings.arena.threeDimensions) {
					;['north', 'south', 'east', 'west'].forEach((side) => {
						const wall = document.createElement('div')
						wall.id = 'gameboard-wall-' + side
						wall.classList.add('gameboard-wall')
						layerWrapper.appendChild(wall)
					})
				}
				;[...tick.value].reverse().forEach((srcLayer) => {
					const layer = document.createElement('div')
					layer.classList.add('layer')
					if (replay.arenaResult.settings.rules.defeatedWorms === 'Solid') {
						layer.classList.add('defeatedWorms_Solid')
					}
					layerWrapper.appendChild(layer)
					let gridTemplateColumns = ''
					rotateArray(srcLayer).forEach((srcColumn, columIndex) => {
						gridTemplateColumns += 'auto '
						srcColumn.forEach((spaceData, rowIndex) => {
							const space = document.createElement('div')
							space.classList.add('space')
							if (rowIndex === 0) {
								space.classList.add('space-border-left')
							}
							if (columIndex === replay.arenaResult.settings.arena.size - 1) {
								space.classList.add('space-border-bottom')
							}
							spaceData.grave.forEach((part) => {
								const spaceContent = document.createElement('div')
								spaceContent.classList.add('space-content')
								spaceContent.classList.add('type-Grave')
								spaceContent.classList.add('type-' + part.type)
								spaceContent.innerHTML = part.team
								spaceContent.style.color = replay.arenaResult.teams[part.team].color.RGB
								space.appendChild(spaceContent)
							})
							if (spaceData.occupiedBy !== null) {
								space.classList.add('type-' + spaceData.occupiedBy.type)
								if (spaceData.occupiedBy.type !== 'Wall') {
									const spaceContent = document.createElement('div')
									spaceContent.classList.add('space-content')
									spaceContent.innerHTML = spaceData.occupiedBy.team + 1
									spaceContent.classList.add('worm')
									spaceContent.style.color = replay.arenaResult.teams[spaceData.occupiedBy.team].color.RGB
									space.appendChild(spaceContent)
								}
							}
							if (spaceData.eatables.apple || 0 < spaceData.eatables.other) {
								const spaceContent = document.createElement('div')
								spaceContent.classList.add('space-content')
								spaceContent.classList.add('eatable')
								if (spaceData.eatables.apple) {
									spaceContent.innerHTML = '🍎'
								} else {
									spaceContent.innerHTML = spaceData.eatables.other
									spaceContent.style.fontStyle = 'italic'
								}
								space.appendChild(spaceContent)
							}
							layer.appendChild(space)
						})
					})
					layer.style.gridTemplateColumns = gridTemplateColumns.trim()
				})
				;(() => {
					let lastSize = null
					function place() {
						const layers = layerWrapper.getElementsByClassName('layer')
						const size = layers[0]?.offsetHeight
						if (size !== lastSize && 0 < size) {
							lastSize = size
							;[...layers].forEach((layer, index) => {
								if (0 < index) {
									layer.style.marginTop = -size + 'px'
								}
								let translate = -(size / (replay.arenaResult.settings.arena.size - 1)) * index
								translate += size / 2
								layer.style.transform = 'translateZ(' + translate + 'px)'
							})
							if (replay.arenaResult.settings.arena.threeDimensions) {
								const translate = -size / 2
								;[
									{
										side: 'north',
										style: [
											{ key: 'height', value: size + 'px' },
											{ key: 'width', value: size + 'px' },
											{ key: 'transform', value: 'rotateX(-90deg) translateZ(' + translate + 'px)' },
										],
									},
									{
										side: 'south',
										style: [
											{ key: 'height', value: size + 'px' },
											{ key: 'width', value: size + 'px' },
											{ key: 'transform', value: 'rotateX(90deg) translateZ(' + translate + 'px)' },
										],
									},
									{
										side: 'east',
										style: [
											{ key: 'height', value: size + 'px' },
											{ key: 'width', value: size + 'px' },
											{ key: 'transform', value: 'rotateX(90deg) rotateY(-90deg) translateZ(' + translate + 'px)' },
										],
									},
									{
										side: 'west',
										style: [
											{ key: 'height', value: size + 'px' },
											{ key: 'width', value: size + 'px' },
											{ key: 'transform', value: 'rotateX(90deg) rotateY(90deg) translateZ(' + translate + 'px)' },
										],
									},
								].forEach((w) => {
									const wall = document.getElementById('gameboard-wall-' + w.side)
									w.style.forEach((style) => {
										wall.style[style.key] = style.value
									})
								})
							}
						}
						requestAnimationFrame(place)
					}
					place()
				})()
			}
		}
		function step(mouseEvent) {
			slider.valueAsNumber += mouseEvent.target === buttonNext ? 1 : -1
			setTick(slider.valueAsNumber)
		}
		function playFrame() {
			if (play.value !== '▶') {
				if (250 < Date.now() - playStarted) {
					const ticks = ticksCache
					const canStepForward = ticks.length > 0 && slider.valueAsNumber < ticks.length - 1
					if (canStepForward) {
						step({ target: buttonNext })
					}
					playStarted = Date.now()
				}
			}
			globalThis.requestAnimationFrame(playFrame)
		}
		globalThis.requestAnimationFrame(playFrame)

		play.addEventListener('click', playToggled)
		buttonBack.addEventListener('click', (mouseEvent) => {
			playToggled(undefined, true)
			step(mouseEvent)
		})
		buttonNext.addEventListener('click', (mouseEvent) => {
			playToggled(undefined, true)
			step(mouseEvent)
		})
		document.addEventListener('keydown', (keyboardEvent) => {
			if (keyboardEvent.code === 'ArrowLeft') {
				buttonBack.click()
			} else if (keyboardEvent.code === 'ArrowRight') {
				buttonNext.click()
			}
		})
		for (let i = 0; i < bestOfCount; i++) {
			const option = document.createElement('option')
			selectMatches.appendChild(option)
			option.innerHTML = 'Match ' + (i + 1)
			option.disabled = true
			option.dataset.index = String(i)
		}
		const matchArr = replay.arenaResult.match ?? []
		for (let i = 0; i < Math.min(bestOfCount, matchArr.length); i++) {
			const opt = selectMatches.options[i]
			if (opt) {
				opt.disabled = false
			}
		}
		replay.addOnMatchStartListener(({ matchIndex }) => {
			const opt = selectMatches.options[matchIndex]
			if (opt) {
				opt.disabled = false
			}
			const sel = selectMatches.selectedOptions[0]
			if (sel && parseInt(sel.dataset.index, 10) === matchIndex) {
				selectMatches.dispatchEvent(new Event('change', { bubbles: true }))
			}
		})
		if (bestOfCount > 1 && selectMatches.options.length > 0) {
			const first = selectMatches.options[0]
			if (!first.disabled) {
				selectMatches.dispatchEvent(new Event('change', { bubbles: true }))
			}
		}
		selectMatches.onchange()
	})
}
