
            // 初始化水族箱元件
            const aquarium = document.querySelector('.aquarium');
            const fishEls = Array.from(document.querySelectorAll('.fish'));
            const plantEls = Array.from(document.querySelectorAll('.plant'));
            const feedCountEl = document.getElementById('feedCount');
            let feedCount = parseInt(localStorage.getItem('feedCount') || '0', 10);
            const updateFeedDisplay = () => {
                feedCountEl.textContent = feedCount;
                localStorage.setItem('feedCount', String(feedCount));
            };
            updateFeedDisplay();
            const incrementFeedCount = () => {
                feedCount += 1;
                updateFeedDisplay();
            };

            // 啟用泡泡動畫（避免載入瞬間閃現）
            requestAnimationFrame(() => aquarium.classList.add('bubbles-ready'));

            // 初始化魚的資料
            const fishes = fishEls.map((el) => {
                const speed = 0.6 + Math.random() * 0.6; // 基礎速度（慢一點）
                const dir = Math.random() < 0.5 ? -1 : 1; // -1 往左、1 往右
                const maxLeft = aquarium.clientWidth - el.offsetWidth;
                const startLeft = Math.random() * maxLeft;
                const startTop = parseFloat(getComputedStyle(el).top);
                el.style.left = startLeft + 'px';
                el.style.top = startTop + 'px';
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
                    driftSpeed: 0.2 + Math.random() * 0.3,
                    driftTimer: 600 + Math.random() * 800
                };
            });

            // 點擊魚 → 加速前進
            fishes.forEach(fish => {
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

            // 飼料列表
            const foods = [];
            const maxFood = 8;
            const pelletRadius = 5;
            const fallSpeed = 0.35; // px per ms

            function removeFood(food, eaten = false) {
                if (food.stopTimer) {
                    clearTimeout(food.stopTimer);
                    food.stopTimer = null;
                }
                const idx = foods.indexOf(food);
                if (idx >= 0) {
                    foods.splice(idx, 1);
                }
                if (food.el.parentNode) {
                    food.el.remove();
                }
                if (eaten) {
                    incrementFeedCount();
                }
            }

            function computeStopY(centerX) {
                const rect = aquarium.getBoundingClientRect();
                let stop = rect.height - pelletRadius - 2; // 水缸底

                plantEls.forEach(plant => {
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
                const stopY = computeStopY(clampedX + pelletRadius);
                const startY = Math.min(stopY, typeof y === 'number' ? y : -13);

                if (foods.length >= maxFood) {
                    const oldest = foods.shift();
                    removeFood(oldest);
                }

                const pellet = document.createElement('div');
                pellet.className = 'pellet';
                pellet.style.left = clampedX + 'px';
                pellet.style.top = (startY - pelletRadius) + 'px';
                aquarium.appendChild(pellet);

                const food = { el: pellet, x: clampedX + pelletRadius, y: startY, stopped: false, stopTimer: null };
                foods.push(food);

                let lastFall = performance.now();
                function fall(now) {
                    const delta = now - lastFall;
                    lastFall = now;
                    if (!food.stopped) {
                        const stop = computeStopY(food.x);
                        food.y = Math.min(stop, food.y + fallSpeed * delta);
                        if (food.y >= stop) {
                            food.y = stop;
                            food.stopped = true;
                            food.stopTimer = setTimeout(() => removeFood(food), 2000);
                        }
                        pellet.style.top = (food.y - pelletRadius) + 'px';
                    }
                    if (!food.stopped) requestAnimationFrame(fall);
                }
                requestAnimationFrame(fall);
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

                fishes.forEach(fish => {
                    const el = fish.el;
                    const fishWidth = el.offsetWidth;
                    const fishHeight = el.offsetHeight;
                    const maxLeft = aqWidth - fishWidth;

                    let left = parseFloat(el.style.left) || 0;
                    let top = fish.top;

                    // 找最近飼料
                    if (foods.length === 0) {
                        fish.targetFood = null;
                    } else if (!fish.targetFood || !foods.includes(fish.targetFood)) {
                        let closest = null;
                        let bestDist = Infinity;
                        foods.forEach(food => {
                            const dx = (left + fishWidth / 2) - food.x;
                            const dy = (top + fishHeight / 2) - food.y;
                            const dist = Math.hypot(dx, dy);
                            if (dist < bestDist) {
                                bestDist = dist;
                                closest = food;
                            }
                        });
                        fish.targetFood = closest;
                    }

                    const moveMultiplier = fish.targetFood ? 1.6 : 1;
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
                        const dx = target.x - (left + fishWidth / 2);
                        const dy = target.y - (top + fishHeight / 2);

                        if (Math.abs(dx) > 4) {
                            fish.dir = dx > 0 ? 1 : -1;
                            fish.el.style.transform = fish.dir === 1 ? 'scaleX(-1)' : 'scaleX(1)';
                        }

                        top += Math.max(-3, Math.min(3, dy * 0.05 * moveMultiplier));
                        top = Math.max(10, Math.min(aqHeight - fishHeight - 10, top));

                        const dist = Math.hypot(dx, dy);
                        if (dist < 18) {
                            target.el.classList.add('eaten');
                            removeFood(target, true);
                            fish.targetFood = null;
                        }
                    } else {
                        // 沒有飼料時的隨機漂移
                        fish.driftTimer -= delta;
                        if (fish.driftTimer <= 0) {
                            fish.driftDir = Math.random() < 0.5 ? -1 : 1;
                            fish.driftSpeed = 0.2 + Math.random() * 0.3;
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
                    el.style.top = top + 'px';
                    el.style.left = left + 'px';
                });

                requestAnimationFrame(animate);
            }

            requestAnimationFrame(animate);
