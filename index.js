let canvas;
let ctx;
let flowField;
let flowFieldAnimation;

let m_canvas;
let m_ctx;
let m_effect;
let m_animation;

window.onload = function() {
    
    let dpr = window.devicePixelRatio || 1;

    // hero background:
    
    canvas = document.getElementById('hero-background');
    ctx = canvas.getContext('2d');

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    flowField = new FlowFieldEffect(ctx, canvas.width, canvas.height);
    flowField.animate(0);

    // block M:

    let div = document.getElementById('block-container');
    m_canvas = document.getElementById('block-m');
    m_ctx = m_canvas.getContext('2d');

    m_canvas.width = div.offsetWidth * dpr;
    m_canvas.height = div.offsetHeight * dpr;
    // m_ctx.scale(dpr, dpr);

    m_effect = new Effect(m_canvas.height, m_canvas.width);
    m_effect.render(m_ctx);
    m_effect.animate(0);
}

window.addEventListener('resize', function() {
    this.cancelAnimationFrame(flowFieldAnimation);

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    flowField = new FlowFieldEffect(ctx, canvas.width, canvas.height);
    flowField.animate(0);
});

const mouse = {
    x: 0,
    y: 0
}
window.addEventListener('mousemove', function(event) {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
});

/* 
 *
 * 
 * 
 * Hero Vector Field
 * 
 * 
 * 
 */

class FlowFieldEffect {
    #ctx;
    #width;
    #height;


    constructor(ctx, width, height) {
        this.#ctx = ctx;
        this.#ctx.strokeStyle = 'white';
        this.#ctx.lineWidth = 1;
        this.#width = width;
        this.#height = height;
        this.lastTime = 0;
        this.interval = 16;
        this.timer = 0;
        this.cellSize = 15;
        this.radius = 0;
        this.vr = 0.03;
        
        this.gradient;
        this.#createGradient();
        this.#ctx.strokeStyle = this.gradient;
    }

    #createGradient() {
        this.gradient = this.#ctx.createLinearGradient(0, 0, this.#width, this.#height);
        this.gradient.addColorStop(0, '#8e99dd');
        this.gradient.addColorStop(1, '#1a2c93');
    }

    #drawLine(angle, x,y) {
        let posX = x;
        let posY = y;

        let dx = mouse.x - posX;
        let dy = mouse.y - posY;

        let distance = (dx * dx) + (dy * dy);

        distance = Math.min(1000000, distance);
        distance = Math.max(50000, distance);

        const length = distance * 0.00001;

        this.#ctx.beginPath();
        this.#ctx.moveTo(x, y);
        this.#ctx.lineTo(x + length * Math.cos(angle), y + length * Math.sin(angle));
        this.#ctx.stroke();
    }

    animate(timestamp) {
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;
        
        if(this.timer > this.interval) {
            this.#ctx.clearRect(0, 0, this.#width, this.#height);

            this.radius += this.vr;
            if(this.radius > 15 || this.radius < -15) {
                this.vr *= -1;
            }
            
            for(let y = 0; y < this.#height; y += this.cellSize) {
                for(let x = 0; x < this.#width; x += this.cellSize) {
                    const angle = (Math.cos(x * 0.01) + Math.sin(y * 0.01)) * this.radius;
                    this.#drawLine(angle, x, y);
                }
            }

            this.timer = 0;
        } else {
            this.timer += deltaTime;
        }
        flowFieldAnimation = requestAnimationFrame(this.animate.bind(this));
    }
}


/* 
 *
 * 
 * 
 * Block M
 * 
 * 
 * 
 */

class Particle {
    constructor(m_effect) {
        this.m_effect = m_effect;

        this.x = Math.floor(Math.random() * this.m_effect.width);
        this.y = Math.floor(Math.random() * this.m_effect.height);
        
        this.r = 0;
        this.g = 39;
        this.b = 76;
        this.color = `rgb(${this.r}, ${this.g}, ${this.b})`;
        this.strokeWidth = Math.floor(Math.random() * 4 + 2);
        
        this.dx;
        this.dy;
        this.speedModifier = Math.floor(Math.random() * 4 + 1);
        
        this.angle = 0;
        this.newAngle = 0;
        this.angleChange = Math.random() * 0.5 + 0.01;
        
        this.history = [{x: this.x, y: this.y}]
        this.maxLength = Math.floor(Math.random() * 50 + 10);

        this.timer = this.maxLength * 2;
    }

    draw(m_ctx) {
        // m_ctx.fillStyle = 'white';
        // m_ctx.fillRect(this.x, this.y, 10, 10);

        m_ctx.beginPath();
        m_ctx.moveTo(this.history[0].x, this.history[0].y);
        for (let i = 1; i < this.history.length; i++) {
            m_ctx.lineTo(this.history[i].x, this.history[i].y);
        }
        m_ctx.strokeStyle = this.color;
        m_ctx.lineWidth = this.strokeWidth;
        m_ctx.stroke();
    }

    update() {
        this.timer--;

        if(this.timer >= 1) {
            let x = Math.floor(this.x / this.m_effect.cellSize);
            let y = Math.floor(this.y / this.m_effect.cellSize);
    
            let flowFieldIdx = this.m_effect.flowField[x + y * this.m_effect.cols];
            if(flowFieldIdx) {
                
                // angle
                this.newAngle = flowFieldIdx.colorAngle;
                if(this.angle > this.newAngle) {
                    this.angle -= this.angleChange;
                } else if (this.angle < this.newAngle) {
                    this.angle += this.angleChange;
                } else {
                    this.angle = this.newAngle;
                }

                // color
                if(flowFieldIdx.alpha > 0) {
                    this.r === flowFieldIdx.red ? this.r : this.r += (flowFieldIdx.red - this.r) * 0.1;
                    this.g === flowFieldIdx.green ? this.g : this.g += (flowFieldIdx.green - this.g) * 0.1;
                    this.b === flowFieldIdx.blue ? this.b : this.b += (flowFieldIdx.blue - this.b) * 0.1;
                    this.color = `rgb(${this.r}, ${this.g}, ${this.b})`;
                }
            }
    
            this.dx = Math.cos(this.angle);
            this.dy = Math.sin(this.angle);
            this.x += this.dx * this.speedModifier;
            this.y += this.dy * this.speedModifier;
    
            this.history.push({x: this.x, y: this.y});
            if (this.history.length > this.maxLength) {
                this.history.shift();
            }
        } else if(this.history.length > 1) {
            this.history.shift();
        } else {
            this.reset();
        }


    }

    reset() {
        let attempts = 0;
        let success = false;

        while (attempts < 4 && !success) {
            attempts++;
            let testIndex = Math.floor(Math.random() * this.m_effect.flowField.length);
            if(this.m_effect.flowField[testIndex]) {
                if(this.m_effect.flowField[testIndex].colorAngle > 0) {
                    success = true;
                    this.timer = this.maxLength * 2;
                    this.x = this.m_effect.flowField[testIndex].x;
                    this.y = this.m_effect.flowField[testIndex].y;
                    this.history = [{x: this.x, y: this.y, color: '#000000'}];
                }
            }
        }

        if(!success) {
            this.x = Math.floor(Math.random() * this.m_effect.width);
            this.y = Math.floor(Math.random() * this.m_effect.height);
            this.timer = this.maxLength * 2;
            this.history = [{x: this.x, y: this.y, color: '#000000'}];
        }
    }
}

class Effect {
    constructor(height, width) {
        this.width = width;
        this.height = height;
        this.particles = [];
        this.numParticles = 800;

        this.cellSize = 1;
        this.rows;
        this.cols;
        this.flowField = [];
        this.curve = 0.5;
        this.zoom = 0.11;


        this.timer = 0;
        this.lastTime = 0;
        this.interval = 16;

        this.init();
    }

    init() {
        // Create flow field
        this.rows = Math.floor(this.height / this.cellSize);
        this.cols = Math.floor(this.width / this.cellSize);
        this.flowField = [];

        // classic flow field
        // for (let y = 0; y < this.rows; y++) {
        //     for (let x = 0; x < this.cols; x++) {
        //         let angle = (Math.cos(x * this.zoom) + Math.sin(y * this.zoom)) * this.curve;
        //         this.flowField.push(angle);
        //     }
        // }

        // Draw Text
        this.drawLogo(m_ctx);
        
        // Scan pixels

        
        // Create Particles
        for (let i = 0; i < this.numParticles; i++) {
            this.particles.push(new Particle(this));
        }
    }

    drawLogo(context) {
        // context.font = "500px Impact";
        // context.textAlign = "center";
        // context.textBaseline = "middle";

        // context.fillStyle = 'red';
        // context.fillText('M', this.width * 0.5, this.height * 0.5, this.width * 0.8);

        const img = new Image();
        img.src = 'm.png';
        img.onload = () => {
            const aspectRatio = img.width / img.height;
            let newWidth = this.width;
            let newHeight = newWidth / aspectRatio;
            if (newHeight > this.height) {
                newHeight = this.height;
                newWidth = newHeight * aspectRatio;
            }

            const xPos = (this.width - newWidth) / 2;
            const yPos = (this.height - newHeight) / 2;
            context.drawImage(img, xPos, yPos, newWidth, newHeight);
            
            // Scan Pixels
            const pixels = context.getImageData(0, 0, this.width, this.height);
            console.log(pixels);
    
            for(let y = 0; y < this.height; y += this.cellSize) {
                for(let x = 0; x < this.width; x += this.cellSize) {
                    const index = (x + y * this.width) * 4;
                    const red = pixels.data[index];
                    const green = pixels.data[index + 1];
                    const blue = pixels.data[index + 2];
                    const alpha = pixels.data[index + 3];
    
                    const grayscale = (red + green + blue) / 3;
                    const colorAngle = ((grayscale / 255) * 6.28).toFixed(2);
    
                    this.flowField.push({
                        x: x,
                        y: y,
                        red: red,
                        green: green,
                        blue: blue,
                        alpha: alpha,
                        colorAngle: colorAngle
                    });
                }
            }
        }
    }

    render(context) {
        
        // this.drawText(m_ctx);
        
        this.particles.forEach(particle => {
            particle.draw(context);
            particle.update();
        });
    }

    animate(timestamp) {
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        if (this.timer > this.interval) {
            m_ctx.clearRect(0, 0, this.width, this.height);
            this.render(m_ctx);
            this.timer = 0;
        } else {
            this.timer += deltaTime;
        }
        m_animation = requestAnimationFrame(this.animate.bind(this));
    }
}

// let observer = new IntersectionObserver((entries, observer) => {
//     entries.forEach(entry => {
//         if (entry.isIntersecting) {
//             // The canvas is in the viewport, start the animation
//             m_animation = requestAnimationFrame(m_effect.animate);
//         } else {
//             // The canvas is not in the viewport, stop the animation
//             cancelAnimationFrame(m_animation);
//         }
//     });
// }, {});

// // Start observing the canvas
// observer.observe(m_canvas);