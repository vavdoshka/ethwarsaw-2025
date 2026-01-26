document.addEventListener("DOMContentLoaded", function () {
	function initMobileMenu() {
		const hamburger = document.querySelector(".hamburger");
		const mainNav = document.querySelector(".main__nav");
		const body = document.body;

		if (!hamburger || !mainNav) return;

		hamburger.addEventListener("click", function (e) {
			e.stopPropagation();
			hamburger.classList.toggle("is-active");
			mainNav.classList.toggle("open");
			body.classList.toggle("hidden");
		});

		mainNav.addEventListener("click", function (e) {
			e.stopPropagation();
		});

		document.addEventListener("click", function () {
			if (mainNav.classList.contains("open")) {
				hamburger.classList.remove("is-active");
				mainNav.classList.remove("open");
				body.classList.remove("hidden");
			}
		});
	}

	initMobileMenu();

	function initSmoothScroll() {
		const scrollLinks = document.querySelectorAll(".scroll__down");

		if (!scrollLinks.length) return;

		scrollLinks.forEach(function (link) {
			link.addEventListener("click", function (e) {
				const targetId = this.getAttribute("href");
				const targetElement = document.querySelector(targetId);

				if (!targetElement) return;

				e.preventDefault();

				const targetPosition = targetElement.offsetTop;
				const startPosition = window.pageYOffset;
				const distance = targetPosition - startPosition;
				const duration = 500;
				let start = null;

				function animation(currentTime) {
					if (start === null) start = currentTime;
					const timeElapsed = currentTime - start;
					const run = ease(timeElapsed, startPosition, distance, duration);
					window.scrollTo(0, run);
					if (timeElapsed < duration) requestAnimationFrame(animation);
				}

				function ease(t, b, c, d) {
					return c * (t / d) + b;
				}

				requestAnimationFrame(animation);
			});
		});
	}

	initSmoothScroll();

	// BG ANIMATION

	const gridContainers = document.querySelectorAll(".grid-container");
const allContainerData = [];

gridContainers.forEach((gridContainer) => {
	const gridCells = [];

	for (let i = 0; i < 443; i++) {
		const gridCell = document.createElement("div");
		gridCell.className = "grid-cell";
		gridCell.style.order = i;
		gridCell.style.zIndex = i;
		gridContainer.appendChild(gridCell);
		gridCells.push(gridCell);
	}

	(function () {
		const maxActive = 24;
		let pulsing = new Map();
		const gridWidth = 17;

		function getBrightnessClass() {
			return Math.random() < 0.5 ? "pulsing-30" : "pulsing-15";
		}

		function getConnectedCells(startIdx, patternType) {
			const patterns = {
				line: (start) => [start, start + 1, start + 2],
				lShape: (start) => [start, start + 1, start + gridWidth, start + gridWidth + 1],
				square: (start) => [start, start + 1, start + gridWidth, start + gridWidth + 1],
				diagonal: (start) => [start, start + gridWidth + 1, start + 2 * gridWidth + 2],
				cross: (start) => [start, start - gridWidth, start + gridWidth, start - 1, start + 1],
				zigzag: (start) => [start, start + 1, start + gridWidth - 1, start + gridWidth],
			};

			const pattern = patterns[patternType] || patterns.line;
			return pattern(startIdx).filter((idx) => idx >= 0 && idx < gridCells.length && !pulsing.has(idx));
		}

		function addConnectedPattern() {
			const capacityLeft = Math.max(0, maxActive - pulsing.size);
			if (capacityLeft < 2) return;
			const r = Math.random();
			let desired;
			if (r < 0.15) desired = 2;
			else if (r < 0.5) desired = 3;
			else desired = 4;
			const groupSize = Math.min(desired, capacityLeft);

			const available = gridCells.map((_, i) => i).filter((i) => !pulsing.has(i));
			if (available.length === 0) return;

			const startIdx = available[Math.floor(Math.random() * available.length)];
			const patternTypes = ["line", "lShape", "square", "diagonal", "cross", "zigzag"];
			const patternType = patternTypes[Math.floor(Math.random() * patternTypes.length)];

			let connectedCells = getConnectedCells(startIdx, patternType);
			if (connectedCells.length < 2) return;
			connectedCells = connectedCells.slice(0, groupSize).filter((idx) => !pulsing.has(idx));
			if (connectedCells.length < 2) return;

			connectedCells.forEach((idx, i) => {
				const delay = Math.random() * 500 + 300;
				const glowDuration = Math.random() * 4000 + 4000;

				setTimeout(() => {
					if (pulsing.size >= maxActive) return;
					if (!pulsing.has(idx)) {
						const cls = getBrightnessClass();
						gridCells[idx].classList.add(cls);
						pulsing.set(idx, { c: cls, isPattern: true });

						setTimeout(() => {
							gridCells[idx].classList.remove(cls);
							gridCells[idx].classList.add(`fading-out-${cls.replace("pulsing-", "")}`);

							setTimeout(() => {
								gridCells[idx].classList.remove(`fading-out-${cls.replace("pulsing-", "")}`);
								pulsing.delete(idx);
							}, 1500);
						}, 1500 + glowDuration);
					}
				}, i * delay);
			});
		}

		function add() {
			if (pulsing.size >= maxActive) return;
			const available = gridCells.map((_, i) => i).filter((i) => !pulsing.has(i));
			if (available.length === 0) return;
			const idx = available[Math.floor(Math.random() * available.length)];
			const cls = getBrightnessClass();

			const glowDuration = Math.random() * 4000 + 3000;

			gridCells[idx].classList.add(cls);
			pulsing.set(idx, { c: cls, isPattern: false });

			setTimeout(() => {
				gridCells[idx].classList.remove(cls);
				gridCells[idx].classList.add(`fading-out-${cls.replace("pulsing-", "")}`);

				setTimeout(() => {
					gridCells[idx].classList.remove(`fading-out-${cls.replace("pulsing-", "")}`);
					pulsing.delete(idx);
				}, 1500);
			}, 1500 + glowDuration);
		}

		function spawnNext() {
			const delay = Math.random() * 800 + 200;
			setTimeout(() => {
				if (pulsing.size < maxActive) {
					if (Math.random() < 0.25) {
						add();
					} else {
						addConnectedPattern();
					}
				}
				spawnNext();
			}, delay);
		}

		spawnNext();
	})();

	allContainerData.push({
		container: gridContainer,
		cells: gridCells,
		mouseX: -1000,
		mouseY: -1000
	});
});

function interpolate(base, glow, f) {
	const hex2rgb = (h) => {
		const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
		return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : null;
	};
	const b = hex2rgb(base);
	const g = hex2rgb(glow);
	if (!b || !g) return base;
	const r = Math.round(b.r + (g.r - b.r) * f);
	const gr = Math.round(b.g + (g.g - b.g) * f);
	const bl = Math.round(b.b + (g.b - b.b) * f);
	return `#${((1 << 24) + (r << 16) + (gr << 8) + bl).toString(16).slice(1)}`;
}

function update() {
	allContainerData.forEach(data => {
		data.cells.forEach(cell => {
			const rect = cell.getBoundingClientRect();
			const x = rect.left + rect.width / 2;
			const y = rect.top + rect.height / 2;
			const dist = Math.sqrt((data.mouseX - x) ** 2 + (data.mouseY - y) ** 2);
			let base = "#1E1E1E";
			let color = base;
			if (dist < 200) {
				const intensity = (1 - dist / 200) ** 2;
				color = interpolate(base, "#7F7F7F", intensity);
			}
			cell.style.boxShadow = `0.5px 0 0 0 ${color},0 0.5px 0 0 ${color},0.5px 0.5px 0 0 ${color},inset 0.5px 0 0 0 ${color},inset 0 0.5px 0 0 ${color}`;
		});
	});
	requestAnimationFrame(update);
}

document.addEventListener("mousemove", (e) => {
	allContainerData.forEach(data => {
		const rect = data.container.getBoundingClientRect();
		if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
			data.mouseX = e.clientX;
			data.mouseY = e.clientY;
		} else {
			data.mouseX = -1000;
			data.mouseY = -1000;
		}
	});
});

update();
});
