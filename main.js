// Aquarium behavior script (clean version)
(() => {
    const aquarium = document.querySelector('.aquarium');
    const fishEls = Array.from(document.querySelectorAll('.fish'));
    const plantEls = Array.from(document.querySelectorAll('.plant'));
    const feedCountEl = document.getElementById('feedCount');

    const mobile = window.innerWidth <= 640;
    const mobileSpeedFactor = mobile ? 0.37 : 1;
    const mobileDriftFactor = mobile ? 0.23 : 1;
    const mobileYFactor = mobile ? 0.6 : 1;

    let feedCount = parseInt(localStorage.getItem('feedCount') || '0', 10);
    const updateFeedDisplay = () => {
        if (feedCountEl) feedCountEl.textContent = feedCount;
        localStorage.setItem('feedCount', String(feedCount));
    };
    const incrementFeedCount = () => {
        feedCount += 1;
        updateFeedDisplay();
    };
    updateFeedDisplay();

    requestAnimationFrame(() => aquarium.classList.add('bubbles-ready'));

    const fishes = fishEls.map((el) => {
        const speed = (0.6 + Math.random() * 0.6) * mobileSpeedFactor;
        const dir = Math.random() < 0.5 ? -1 : 1;
        const maxLeft = aquarium.clientWidth - el.offsetWidth;
        const startLeft = Math.random() * maxLeft;
        const maxTop = Math.max(10, aquarium.clientHeight - el.offsetHeight - 10);
        const startTop = Math.random() * maxTop;
        el.style.left = `${startLeft}px`;
        el.style.top = `${startTop}px`;
        el.style.transform = dir === 1 ? 'scaleX(-1)' : 'scaleX(1)';
        return {
            el,
            speed,
            currentSpeed: speed,
            dir,
            scared: false,
            recoverTimer: null,
            top: startTop,
            targetFood: null,
            driftDir: Math.random() < 0.5 ? -1 : 1,
            driftSpeed: (0.2 + Math.random() * 0.3) * mobileDriftFactor,
            driftTimer: 600 + Math.random() * 800,
            nextFlipAllowed: 0,
        };
    });

    fishes.forEach((fish) => {
        fish.el.addEventListener('click', () => {
            if (fish.recoverTimer) clearTimeout(fish.recoverTimer);
            fish.scared = true;
            fish.currentSpeed = fish.speed * 3;
            fish.el.style.transform = fish.dir === 1 ? 'scaleX(-1)' : 'scaleX(1)';
            fish.recoverTimer = setTimeout(() => {
                fish.currentSpeed = fish.speed;
                fish.scared = false;
            }, 2000);
        });
    });

    const foods = [];
    const maxFood = 8;
    const pelletRadius = mobile ? 4 : 5;
    const fallSpeed = 0.35; // retained for compatibility (no fall now)

    function removeFood(food, eaten = false) {
        if (food.stopTimer) {
            clearTimeout(food.stopTimer);
            food.stopTimer = null;
        }
        const idx = foods.indexOf(food);
        if (idx >= 0) foods.splice(idx, 1);
        food.el.remove();
        if (eaten) incrementFeedCount();
    }

    function computeStopY(centerX) {
        const rect = aquarium.getBoundingClientRect();
        let stop = rect.height - pelletRadius - 2;
        plantEls.forEach((plant) => {
            const r = plant.getBoundingClientRect();
            const left = r.left - rect.left;
            const right = left + r.width;
            if (centerX >= left && centerX <= right) {
                const top = r.top - rect.top;
                const candidate = top - pelletRadius;
                if (candidate < stop) stop = candidate;
            }
        });
        return stop;
    }

    function dropFood(x, y) {
        const rect = aquarium.getBoundingClientRect();
        const clampedX = Math.max(8, Math.min(rect.width - 18, x));
        const clampedY = Math.max(10, Math.min(rect.height - 20, typeof y === 'number' ? y : rect.height * 0.6));

        if (foods.length >= maxFood) {
            const oldest = foods.shift();
            removeFood(oldest);
        }

        const pellet = document.createElement('div');
        pellet.className = 'pellet';
        pellet.style.left = `${clampedX}px`;
        pellet.style.top = `${clampedY - pelletRadius}px`;
        aquarium.appendChild(pellet);

        const food = {
            el: pellet,
            x: clampedX + pelletRadius,
            y: clampedY,
            stopY: clampedY,
            stopped: true,
            stopTimer: null,
            falling: false,
            created: performance.now(),
            assigned: [],
        };
        if (fishes.length > 0) {
            const shuffled = [...fishes].sort(() => Math.random() - 0.5);
            food.assigned = shuffled.slice(0, Math.min(3, shuffled.length));
        }
        food.stopTimer = setTimeout(() => removeFood(food), 2000);
        foods.push(food);
        fishes.forEach((f) => (f.targetFood = null));
    }

    function dropAtPoint(clientX, clientY) {
        const rect = aquarium.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        if (x < 0 || x > rect.width || y < 0 || y > rect.height) {
            const randomX = rect.width * (0.35 + Math.random() * 0.3);
            const randomY = rect.height * (0.4 + Math.random() * 0.5);
            dropFood(randomX, randomY);
        } else {
            dropFood(x, y);
        }
    }

    aquarium.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.fish')) return;
        dropAtPoint(e.clientX, e.clientY);
    });
    document.body.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.aquarium')) return;
        dropAtPoint(e.clientX, e.clientY);
    });

    let lastTime = null;
    function animate(time) {
        if (!lastTime) lastTime = time;
        const delta = time - lastTime;
        lastTime = time;

        const aqWidth = aquarium.clientWidth;
        const aqHeight = aquarium.clientHeight;

        fishes.forEach((fish) => {
            const el = fish.el;
            const fishWidth = el.offsetWidth;
            const fishHeight = el.offsetHeight;
            const maxLeft = aqWidth - fishWidth;

            let left = parseFloat(el.style.left) || 0;
            let top = fish.top;

            if (foods.length === 0) {
                fish.targetFood = null;
            } else {
                // Chase only foods assigned to this fish; if none, pick closest anyway
                let candidate = null;
                let bestDist = Infinity;
                foods.forEach((food) => {
                    if (food.assigned.length && !food.assigned.includes(fish)) return;
                    const dx = left + fishWidth / 2 - food.x;
                    const dy = top + fishHeight / 2 - food.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist < bestDist) {
                        bestDist = dist;
                        candidate = food;
                    }
                });
                fish.targetFood = candidate;
            }

            const moveMultiplier = fish.targetFood ? 1.05 : 1;
            left += fish.dir * fish.currentSpeed * moveMultiplier * (delta / 16);

            if (left <= 0) {
                left = 0;
                fish.dir = 1;
                fish.el.style.transform = 'scaleX(-1)';
            } else if (left >= maxLeft) {
                left = maxLeft;
                fish.dir = -1;
                fish.el.style.transform = 'scaleX(1)';
            }

            if (fish.targetFood) {
                const target = fish.targetFood;
                const mouthX = left + (fish.dir === -1 ? fishWidth * 0.1 : fishWidth * 0.9);
                const mouthY = top + fishHeight * 0.45;
                const dx = target.x - mouthX;
                const dy = target.y - mouthY;

                if (Math.abs(dx) > 14 && time >= fish.nextFlipAllowed) {
                    fish.dir = dx > 0 ? 1 : -1;
                    fish.el.style.transform = fish.dir === 1 ? 'scaleX(-1)' : 'scaleX(1)';
                    fish.nextFlipAllowed = time + 320;
                }

                const verticalBoost = target.falling ? 1.1 : 1;
                const verticalStep = dy * 0.08 * moveMultiplier * mobileYFactor * verticalBoost;
                const cap = (mobileYFactor < 1 ? 6 : 8) * verticalBoost;
                const stepClamped = Math.sign(verticalStep) * Math.min(Math.abs(verticalStep), Math.abs(dy), cap);
                top += stepClamped;
                top = Math.max(10, Math.min(aqHeight - fishHeight - 10, top));

                const eatX = fishHeight * 0.18;
                const eatY = fishHeight * 0.22;
                if (Math.abs(dx) < eatX && Math.abs(dy) < eatY) {
                    target.el.classList.add('eaten');
                    removeFood(target, true);
                    fish.targetFood = null;
                }
            } else {
                fish.driftTimer -= delta;
                if (fish.driftTimer <= 0) {
                    fish.driftDir = Math.random() < 0.5 ? -1 : 1;
                    fish.driftSpeed = (0.2 + Math.random() * 0.3) * mobileDriftFactor;
                    fish.driftTimer = 600 + Math.random() * 800;
                }
                top += fish.driftDir * fish.driftSpeed * (delta / 16);
                if (top <= 10) {
                    top = 10;
                    fish.driftDir = 1;
                } else if (top >= aqHeight - fishHeight - 10) {
                    top = aqHeight - fishHeight - 10;
                    fish.driftDir = -1;
                }
            }

            fish.top = top;
            el.style.top = `${top}px`;
            el.style.left = `${left}px`;
        });

        requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
})();
