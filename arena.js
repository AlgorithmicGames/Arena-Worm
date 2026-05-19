'use strict'
const _worms = []
let _arena
let _coordinate_end
let _coordinate_middle
let _participants
let _settings
let _shrinkOnTick
let _ticksSinceShrink = 0
let _shrinks = 0
let _worms_lastLength
let _participantPromises
class Direction {
	constructor(name) {
		Object.defineProperty(this, 'NAME', {
			value: name,
			writable: false,
			enumerable: true,
			configurable: true,
		})
		this.toString = () => name
	}
}
const Directions = { 'FORWARD': new Direction('Forward'), 'BACKWARD': new Direction('Backward'), 'LEFT': new Direction('Left'), 'RIGHT': new Direction('Right'), 'UP': new Direction('Up'), 'DOWN': new Direction('Down') }
Object.freeze(Directions)
class Placeable {
	constructor(space = null, team = null) {
		Object.defineProperty(this, 'TEAM', {
			value: team,
			writable: false,
			enumerable: true,
			configurable: true,
		})
		let currentSpace = space
		this.getSpace = () => {
			return currentSpace
		}
		this.setSpace = (space) => {
			currentSpace = space
		}
	}
}
class Wall extends Placeable {
	constructor(space = null) {
		super(space)
	}
}
class Controllable extends Placeable {
	constructor(body, team, space = null) {
		const BODY = body
		super(space, team)
		if (this.constructor.name === 'Controllable') {
			ArenaHelper.postAbort('', 'Controllable is not constructable.')
		}
		if (this.constructor.name === 'SolidWorm') {
			BODY.push(this)
		}
		Object.defineProperty(this, 'BODY_INDEX', {
			value: BODY.length,
			writable: false,
			enumerable: true,
			configurable: true,
		})
		this.getLength = () => {
			return BODY.length
		}
	}
}
class SolidWorm extends Controllable {
	constructor(direction = new Direction()) {
		const BODY = []
		super(BODY, _worms.length)
		this.direction = direction
		this.extendBody = () => {
			BODY.push(new TrailingBody(BODY))
		}
		let startSize = _settings.rules.startLength
		while (0 < startSize - 1) {
			startSize--
			this.extendBody()
		}
		this.getWormIndex = () => {
			const index = _worms.indexOf(this)
			if (index === -1) {
				ArenaHelper.postAbort('', 'SolidWorm not in list.')
			}
			return index
		}
		this.move = (nextSpace) => {
			const firstSpace = nextSpace
			if (_settings.rules.apples === 'AppleLess') {
				this.extendBody()
			}
			let lastSpace
			BODY.forEach((part) => {
				lastSpace = part.getSpace()
				if (nextSpace !== null) {
					nextSpace.setOccupiedBy(part)
				}
				nextSpace = lastSpace
			})
			if (lastSpace && firstSpace !== lastSpace && BODY.includes(lastSpace.getOccupiedBy())) {
				lastSpace.setOccupiedBy(null)
			}
		}
		this.getParticipant = () => {
			return _participants.get(this.TEAM, 0)
		}
		this.kill = () => {
			_worms.splice(this.getWormIndex(), 1)
			BODY.forEach((part) => {
				const space = part.getSpace()
				if (space) {
					space.addToGrave(part)
					let occupiedBy
					switch (_settings.rules.defeatedWorms) {
						case 'Solid':
							occupiedBy = new Wall(space)
							break
						case 'Eatable':
							space.addEatable()
							if (part.constructor.name === 'SolidWorm') {
								BODY.filter((b) => !b.getSpace()).forEach(space.addEatable)
							} /* fall through */
						case 'Disappears':
							occupiedBy = null
							break
					}
					space.setOccupiedBy(occupiedBy)
				}
			})
		}
		this.isAlive = () => _worms.includes(this)
		this.getParticipant().payload.worm = this
	}
}
class TrailingBody extends Controllable {
	constructor(body) {
		super(body, body[0].TEAM)
		this.getHead = () => body[0]
	}
}
class Apple {
	static #idMemory = 1
	static #placedApples = []
	static getPlacedApples = () => Apple.#placedApples.slice()
	constructor(space) {
		if (!space) {
			throw Error('Space error.')
		}
		const ID = Apple.#idMemory++
		Apple.#placedApples.push(space)
		this.getID = () => {
			return ID
		}
		this.remove = () => {
			Apple.#placedApples.splice(Apple.#placedApples.indexOf(space), 1)
		}
	}
}
class Space {
	constructor(x, y, z) {
		const CHALLENGERS = []
		const GRAVE = []
		Object.defineProperty(this, 'POS', {
			value: Object.freeze({ x: x, y: y, z: z }),
			writable: false,
			enumerable: true,
			configurable: true,
		})
		let occupiedBy = null
		let eatables = 0
		let apple = null
		this.getGrave = () => {
			return GRAVE.slice()
		}
		this.addToGrave = (controllable) => GRAVE.push(controllable)
		this.addEatable = () => eatables++
		this.addChallenger = (solidWorm) => CHALLENGERS.push(solidWorm)
		this.feedEatables = () => {
			if (apple) {
				this.toggleApple()
				if (CHALLENGERS.length === 1) {
					eatables++
				}
			}
			if (CHALLENGERS.length === 1) {
				CHALLENGERS.forEach((solidWorm) => {
					if (_settings.rules.winner === 'MostPoints') {
						solidWorm.getParticipant().addScore(eatables)
					}
					while (0 < eatables) {
						eatables--
						solidWorm.extendBody()
					}
				})
			}
		}
		this.executeChallenge = () => {
			const willBeUnoccupied = occupiedBy === null ? true : !(occupiedBy instanceof Wall) && occupiedBy.getLength() - 1 === occupiedBy.BODY_INDEX
			CHALLENGERS.forEach((solidWorm) => {
				if (willBeUnoccupied) {
					solidWorm.move(this)
				}
				if (1 < CHALLENGERS.length || !willBeUnoccupied) {
					solidWorm.kill()
				}
			})
			while (CHALLENGERS.length) {
				CHALLENGERS.pop()
			}
		}
		this.getOccupiedBy = () => occupiedBy
		this.setOccupiedBy = (placeable) => {
			occupiedBy = placeable
			if (placeable !== null) {
				placeable.setSpace(this)
			}
		}
		this.toggleApple = () => {
			if (occupiedBy === null) {
				if (apple) {
					apple.remove()
					apple = null
				} else {
					apple = new Apple(this)
				}
			}
		}
		this.getEatables = () => {
			return { apple: apple ? apple.getID() : null, other: eatables }
		}
	}
}
function getPos(solidWorm) {
	for (let z = 0; z < _arena.length; z++) {
		const column = _arena[z]
		for (let x = 0; x < column.length; x++) {
			const row = column[x]
			for (let y = 0; y < row.length; y++) {
				if (solidWorm === row[y].getOccupiedBy()) {
					return { z: z, x: x, y: y }
				}
			}
		}
	}
	ArenaHelper.postAbort('', 'Position of SolidWorm:' + solidWorm.TEAM + ' not found.')
}
function getNextPos(pos, direction) {
	pos = JSON.parse(JSON.stringify(pos))
	switch (direction) {
		case Directions.FORWARD:
			pos.y++
			break
		case Directions.BACKWARD:
			pos.y--
			break
		case Directions.RIGHT:
			pos.x++
			break
		case Directions.LEFT:
			pos.x--
			break
		case Directions.UP:
			pos.z++
			break
		case Directions.DOWN:
			pos.z--
			break
	}
	const xUnder = pos.x < 0
	const xOver = _settings.arena.size <= pos.x
	const yUnder = pos.y < 0
	const yOver = _settings.arena.size <= pos.y
	const zUnder = pos.z < 0
	const zOver = (_settings.arena.threeDimensions ? _settings.arena.size : 1) <= pos.z
	if (xUnder || xOver || yUnder || yOver || zUnder || zOver) {
		if (_settings.border.noOuterBorder) {
			if (xUnder) {
				pos.x = _settings.arena.size - 1
			} else if (xOver) {
				pos.x = 0
			} else if (yUnder) {
				pos.y = _settings.arena.size - 1
			} else if (yOver) {
				pos.y = 0
			} else if (zUnder) {
				pos.z = _settings.arena.threeDimensions ? _settings.arena.size - 1 : 0
			} else if (zOver) {
				pos.z = 0
			}
		} else {
			return null
		}
	}
	return pos
}
function updateDirection(participant) {
	function getSelectedDirection(response) {
		switch (response) {
			default:
				return null // Faulty direction, keep previous.
			case 'y+':
				return Directions.FORWARD
			case 'y-':
				return Directions.BACKWARD
			case 'x+':
				return Directions.RIGHT
			case 'x-':
				return Directions.LEFT
			case 'z+':
				return Directions.UP
			case 'z-':
				return Directions.DOWN
		}
	}
	function rotateDirection(solidWorm, direction) {
		switch (solidWorm.TEAM) {
			case 1:
				switch (direction) {
					case Directions.FORWARD:
						return Directions.BACKWARD
					case Directions.BACKWARD:
						return Directions.FORWARD
					case Directions.RIGHT:
						return Directions.LEFT
					case Directions.LEFT:
						return Directions.RIGHT
				}
				break
			case 2:
				switch (direction) {
					case Directions.FORWARD:
						return Directions.RIGHT
					case Directions.BACKWARD:
						return Directions.LEFT
					case Directions.RIGHT:
						return Directions.BACKWARD
					case Directions.LEFT:
						return Directions.FORWARD
				}
				break
			case 3:
				switch (direction) {
					case Directions.FORWARD:
						return Directions.LEFT
					case Directions.BACKWARD:
						return Directions.RIGHT
					case Directions.RIGHT:
						return Directions.FORWARD
					case Directions.LEFT:
						return Directions.BACKWARD
				}
				break
			case 4:
				switch (direction) {
					case Directions.FORWARD:
						return Directions.UP
					case Directions.BACKWARD:
						return Directions.DOWN
					case Directions.UP:
						return Directions.BACKWARD
					case Directions.DOWN:
						return Directions.FORWARD
				}
				break
			case 5:
				switch (direction) {
					case Directions.FORWARD:
						return Directions.DOWN
					case Directions.BACKWARD:
						return Directions.UP
					case Directions.UP:
						return Directions.FORWARD
					case Directions.DOWN:
						return Directions.BACKWARD
				}
				break
		}
		return direction
	}
	const solidWorm = participant.payload.worm
	const direction = rotateDirection(solidWorm, getSelectedDirection(participant.payload.response))
	let notAllowedDirection
	if (!_settings.arena.threeDimensions && [Directions.UP, Directions.DOWN].includes(direction)) {
		return
	}
	switch (solidWorm.direction) {
		case Directions.FORWARD:
			notAllowedDirection = Directions.BACKWARD
			break
		case Directions.BACKWARD:
			notAllowedDirection = Directions.FORWARD
			break
		case Directions.RIGHT:
			notAllowedDirection = Directions.LEFT
			break
		case Directions.LEFT:
			notAllowedDirection = Directions.RIGHT
			break
		case Directions.UP:
			notAllowedDirection = Directions.DOWN
			break
		case Directions.DOWN:
			notAllowedDirection = Directions.UP
			break
	}
	if (direction && notAllowedDirection !== direction) {
		solidWorm.direction = direction
	}
}
function parseArena() {
	const parsedArena = []
	_arena.forEach((c) => {
		const column = []
		parsedArena.push(column)
		c.forEach((r) => {
			const row = []
			column.push(row)
			r.forEach((space) => {
				const placeable = space.getOccupiedBy()
				let occupiedBy = null
				if (placeable !== null) {
					occupiedBy = {
						type: placeable.constructor.name,
					}
					if (!(placeable instanceof Wall)) {
						occupiedBy.team = placeable.TEAM
						occupiedBy.isLastTrailingBody = placeable.getLength() - 1 === placeable.BODY_INDEX
					}
				}
				row.push({
					eatables: space.getEatables(),
					occupiedBy: occupiedBy,
					grave: space.getGrave().map((placeable) => {
						return {
							type: placeable.constructor.name,
							team: placeable.TEAM,
						}
					}),
				})
			})
		})
	})
	return parsedArena
}
function tick() {
	function wall(space) {
		if (space.getEatables().apple) {
			space.toggleApple()
		}
		let occupiedBy = space.getOccupiedBy()
		if (occupiedBy !== null) {
			switch (occupiedBy.constructor.name) {
				case 'TrailingBody':
					occupiedBy = occupiedBy.getHead()
					/* fall through */
				case 'SolidWorm':
					occupiedBy.kill()
					break
			}
		}
		if (occupiedBy === null || occupiedBy.constructor.name !== 'Wall') {
			space.setOccupiedBy(new Wall(space, occupiedBy))
		}
	}
	if (_shrinkOnTick !== null) {
		_ticksSinceShrink++
		if (_shrinkOnTick === _ticksSinceShrink) {
			_ticksSinceShrink = 0
			let spaces = _arena.flat().flat()
			switch (_settings.border.shrinkMode) {
				case 'RandomPlacedWall_single':
					spaces = spaces.filter((space) => space.getOccupiedBy() === null)
					if (spaces.length) {
						const randomSpace = Math.floor(Math.random() * spaces.length)
						wall(spaces[randomSpace])
					}
					break
				case 'RandomPlacedWall_fourSymmetry':
					{
						let retries = 100
						while (0 < retries) {
							retries--
							const layer = Math.floor(Math.random() * _arena.length)
							const short = Math.floor(Math.random() * Math.floor(_settings.arena.size / 2))
							const long = Math.floor(Math.random() * Math.ceil(_settings.arena.size / 2))
							spaces = [
								_arena[layer][short][long],
								_arena[layer][_settings.arena.size - 1 - long][short],
								_arena[layer][long][_settings.arena.size - 1 - short],
								_arena[layer][_settings.arena.size - 1 - short][_settings.arena.size - 1 - long],
							]
							if (spaces.filter((space) => space.getOccupiedBy() === null).length === spaces.length) {
								spaces.forEach((space) => {
									wall(space)
								})
								break
							}
						}
					}
					break
				case 'RandomPlacedWall_perWorm':
					_worms.forEach(() => {
						spaces = spaces.filter((space) => space.getOccupiedBy() === null)
						if (spaces.length) {
							const randomSpace = Math.floor(Math.random() * spaces.length)
							wall(spaces[randomSpace])
						}
					})
					break
				default:
				case 'WallOuterArea':
					spaces.forEach((space) => {
						if (space.POS.x === _shrinks || space.POS.x === _settings.arena.size - 1 - _shrinks || space.POS.y === _shrinks || space.POS.y === _settings.arena.size - 1 - _shrinks || _settings.arena.threeDimensions && (space.POS.z === _shrinks || space.POS.z === _arena.length - 1 - _shrinks)) {
							wall(space)
						}
					})
					break
			}
			_shrinks++
		}
	}
	let retries = 100
	function getEmptySpaces() {
		return _arena.flat().flat().filter((space) => space.getOccupiedBy() === null)
	}
	switch (_settings.rules.apples) {
		case 'FourSymmetry':
			while (0 < retries && Apple.getPlacedApples().length < 4) {
				retries--
				Apple.getPlacedApples().forEach((space) => {
					space.toggleApple()
				})
				const layer = Math.floor(Math.random() * _arena.length)
				const short = Math.floor(Math.random() * Math.floor(_settings.arena.size / 2))
				const long = Math.floor(Math.random() * Math.ceil(_settings.arena.size / 2))
				_arena[layer][short][long].toggleApple()
				_arena[layer][_settings.arena.size - 1 - long][short].toggleApple()
				_arena[layer][long][_settings.arena.size - 1 - short].toggleApple()
				_arena[layer][_settings.arena.size - 1 - short][_settings.arena.size - 1 - long].toggleApple()
			}
			if (Apple.getPlacedApples().length < 4) {
				Apple.getPlacedApples().forEach((space) => {
					space.toggleApple()
				})
			}
			break
		case 'FourRandom_asymmetric':
			if (Apple.getPlacedApples().length < 4) {
				Apple.getPlacedApples().forEach((space) => {
					space.toggleApple()
				})
				while (Apple.getPlacedApples().length < 4) {
					const emptySpaces = getEmptySpaces()
					if (emptySpaces.length) {
						const randomSpace = Math.floor(Math.random() * emptySpaces.length)
						emptySpaces[randomSpace].toggleApple()
					} else {
						break
					}
				}
			}
			break
		case 'Single':
		case 'OneRandomPerWorm_asymmetric':
			while (Apple.getPlacedApples().length < (_settings.rules.apples === 'Single' ? 1 : _worms.length)) {
				const emptySpaces = getEmptySpaces()
				if (emptySpaces.length) {
					const randomSpace = Math.floor(Math.random() * emptySpaces.length)
					emptySpaces[randomSpace].toggleApple()
				} else {
					break
				}
			}
			break
	}
	const parsedArena = parseArena()
	ArenaHelper.log('tick', parsedArena)
	_participantPromises = []
	_worms.forEach((solidWorm) => {
		let arenaClone = JSON.parse(JSON.stringify(parsedArena))
		let rotate
		switch (solidWorm.TEAM) {
			case 0:
				rotate = 0
				break
			case 1:
				rotate = 2
				break
			case 2:
				rotate = 3
				break
			case 3:
				rotate = 1
				break
			case 4:
				rotate = -3
				break
			case 5:
				rotate = -1
				break
		}
		for (let i = 0; i < rotate; i++) {
			arenaClone.forEach((layer, z) => {
				arenaClone[z] = rotateArray(layer)
			})
		}
		for (let i = 0; rotate < i; i--) {
			arenaClone = rotateArray(arenaClone)
		}
		if (rotate < 0) {
			arenaClone.reverse().forEach((layer, z) => {
				arenaClone[z] = rotateArray(layer.reverse())
			})
			for (let i = 0; rotate < i; i--) {
				arenaClone = rotateArray(arenaClone)
			}
		}
		const participant = solidWorm.getParticipant()
		participant.payload.response = null

		_participantPromises.push(
			participant.payload.worker.postMessage(arenaClone).then((response) => {
				if (response.message) {
					participant.payload.response = response.message.data
					updateDirection(participant)
				}
			}),
		)
	})

	Promise.allSettled(_participantPromises).then(() => {
		const challengedSpaces = []
		const borderCollisions = []
		_worms.forEach((solidWorm) => {
			const pos = getPos(solidWorm)
			const posNext = getNextPos(pos, solidWorm.direction)
			if (posNext === null) {
				borderCollisions.push(solidWorm)
			} else {
				const space = _arena[posNext.z][posNext.x][posNext.y]
				space.addChallenger(solidWorm)
				if (!challengedSpaces.includes(space)) {
					challengedSpaces.push(space)
				}
			}
		})
		borderCollisions.forEach((solidWorm) => {
			solidWorm.kill()
		})
		challengedSpaces.forEach((space) => {
			space.feedEatables()
		})
		challengedSpaces.forEach((space) => {
			space.executeChallenge()
		})
		if (_settings.rules.winner === 'LastWormStanding' && _worms_lastLength !== _worms.length) {
			_worms.forEach((solidWorm) => {
				solidWorm.getParticipant().addScore(1)
			})
		}
		_worms_lastLength = _worms.length
		if ((_settings.rules.winner === 'LastWormStanding' ? 1 : 0) < _worms.length) {
			tick()
		} else {
			if (_settings.rules.winner === 'LastWormStanding' && _settings.rules.bonusToLonger) {
				const list = []
				let maxLength = -1
				while (list.length < _participants.countTeams()) {
					const participant = _participants.get(list.length, 0)
					const wormLength = participant.payload.worm.getLength()
					maxLength = Math.max(maxLength, wormLength)
					list.push({
						participant: participant,
						wormLength: wormLength,
						score: null,
					})
				}
				maxLength *= 10
				_participants.getScores().forEach((s) => {
					list[s.team].score = s.score
				})
				let bonusPoint = 0
				let lastScore = null
				let lastLength = null
				list.sort((s1, s2) => (s1.score - s2.score) * maxLength + (s1.wormLength - s2.wormLength)).forEach((s) => {
					if (lastScore === s.score && lastLength != s.wormLength) {
						bonusPoint++
					}
					s.participant.addBonusScore(bonusPoint)
					lastScore = s.score
					lastLength = s.wormLength
				})
			}
			ArenaHelper.log('tick', parseArena())
			ArenaHelper.postDone()
		}
	})
}
function rotateArray(array) {
	const result = []
	for (let i = 0; i < array[0].length; i++) {
		const row = array.map((e) => e[i]).reverse()
		result.push(row)
	}
	return result
}
ArenaHelper.init = (participants, settings) => {
	_participants = participants
	_settings = settings
	if (_settings.arena.size % 2 !== 1) {
		ArenaHelper.postAbort('', 'Arena size has to be uneven.')
	} else if (_settings.rules.winner === 'MostPoints' && _settings.rules.defeatedWorms !== 'Solid') {
		ArenaHelper.postAbort('', 'Incompatible rules: MostPoints can only be played with Solid.')
	} else if (!_settings.arena.threeDimensions && 4 < _participants.countTeams()) {
		ArenaHelper.postAbort('', '`threeDimensions` is required for more than 4 participants.')
	} else if (4 < _participants.countTeams() && ['FourSymmetry', 'FourRandom_asymmetric'].includes(_settings.rules.apples)) {
		ArenaHelper.postAbort('', 'Can not play `FourSymmetry` or `FourRandom_asymmetric` with more than 4 participants.')
	} else if (4 < _participants.countTeams() && _settings.border.shrinkMode === 'RandomPlacedWall_fourSymmetry') {
		ArenaHelper.postAbort('', 'RandomPlacedWall_fourSymmetry not symmetric with arena.threeDimensions.')
	} else if (_settings.border.shrinkMode === 'WallOuterArea' && _settings.border.noOuterBorder) {
		ArenaHelper.postAbort('', 'WallOuterArea is not compatible with noOuterBorder.')
	} else {
		const shrinkSetting = _settings.rules.apples === 'AppleLess' ? -1 : _settings.border.movesPerArenaShrink
		if (shrinkSetting < 0) {
			_shrinkOnTick = null
		} else if (shrinkSetting === 0) {
			_shrinkOnTick = _settings.arena.size
		} else {
			_shrinkOnTick = _settings.border.movesPerArenaShrink
		}

		_arena = []
		while (_arena.length < _settings.arena.size) {
			const column = []
			while (column.length < _settings.arena.size) {
				const row = []
				while (row.length < _settings.arena.size) {
					row.push(new Space(column.length, row.length, _arena.length))
				}
				column.push(row)
			}
			_arena.push(column)
			if (!_settings.arena.threeDimensions) {
				break
			}
		}

		_coordinate_end = _settings.arena.size - 1
		_coordinate_middle = Math.floor(_coordinate_end / 2)
		;[
			{
				solidWorm: [Directions.FORWARD],
				x: _coordinate_middle,
				y: 0,
				z: _settings.arena.threeDimensions ? _coordinate_middle : 0,
			},
			{
				solidWorm: [Directions.BACKWARD],
				x: _coordinate_middle,
				y: _coordinate_end,
				z: _settings.arena.threeDimensions ? _coordinate_middle : 0,
			},
			{
				solidWorm: [Directions.RIGHT],
				x: 0,
				y: _coordinate_middle,
				z: _settings.arena.threeDimensions ? _coordinate_middle : 0,
			},
			{
				solidWorm: [Directions.LEFT],
				x: _coordinate_end,
				y: _coordinate_middle,
				z: _settings.arena.threeDimensions ? _coordinate_middle : 0,
			},
			{
				solidWorm: [Directions.UP],
				x: _coordinate_middle,
				y: _coordinate_middle,
				z: 0,
			},
			{
				solidWorm: [Directions.DOWN],
				x: _coordinate_middle,
				y: _coordinate_middle,
				z: _coordinate_end,
			},
		].forEach((input) => {
			if (_worms.length < _participants.countTeams()) {
				const solidWorm = new SolidWorm(...input.solidWorm)
				_arena[input.z][input.x][input.y].setOccupiedBy(solidWorm)
				_worms.push(solidWorm)
			}
		})
		_worms_lastLength = _worms.length
		const workerInitPromises = []
		_participants.forEach((participant) => {
			workerInitPromises.push(
				participant.addWorker().then((worker) => {
					participant.payload.worker = worker
				}),
			)
		})
		Promise.allSettled(workerInitPromises).then(() => {
			tick()
		})
	}
}
